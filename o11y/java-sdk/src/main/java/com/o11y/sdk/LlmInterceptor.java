package com.o11y.sdk;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Aspect
@Component
public class LlmInterceptor {

    private final SpanReporter reporter;

    public LlmInterceptor(SpanReporter reporter) {
        this.reporter = reporter;
    }

    @Around("execution(* org.springframework.ai.chat.client.ChatClient.call(..))")
    public Object aroundLlmCall(ProceedingJoinPoint pjp) throws Throwable {
        String traceId = O11yToolContext.getTraceId();
        String sessionId = O11yToolContext.getSessionId();
        if (traceId == null || sessionId == null) {
            return pjp.proceed();
        }

        String parentSpanId = O11yToolContext.getCurrentSpanId();
        O11ySpan span = O11ySpan.start(traceId, sessionId, "llm_call", "LLM")
            .withParent(parentSpanId)
            .withInput(pjp.getArgs());

        O11yToolContext.setCurrentSpanId(span.getId());

        try {
            Object result = pjp.proceed();
            span.end(result);

            Map<String, Object> meta = new HashMap<>();
            extractSpringAiTokenUsage(result, meta);
            span.withMetadata(meta);

            return result;
        } catch (Throwable t) {
            span.fail(t.getMessage());
            throw t;
        } finally {
            reporter.report(span);
            O11yToolContext.setCurrentSpanId(parentSpanId);
        }
    }

    /**
     * Extract token usage from Spring AI ChatResponse via reflection,
     * avoiding a compile-time dependency on spring-ai-core.
     */
    private void extractSpringAiTokenUsage(Object result, Map<String, Object> meta) {
        if (result == null) return;
        try {
            Class<?> chatResponseClass = Class.forName("org.springframework.ai.chat.model.ChatResponse");
            if (!chatResponseClass.isInstance(result)) return;

            Object metadata = chatResponseClass.getMethod("getMetadata").invoke(result);
            if (metadata == null) return;

            Object usage = metadata.getClass().getMethod("getUsage").invoke(metadata);
            if (usage == null) return;

            Class<?> usageClass = usage.getClass();
            Object promptTokens = usageClass.getMethod("getPromptTokens").invoke(usage);
            Object completionTokens = usageClass.getMethod("getCompletionTokens").invoke(usage);
            Object totalTokens = usageClass.getMethod("getTotalTokens").invoke(usage);

            if (promptTokens != null) meta.put("prompt_tokens", promptTokens);
            if (completionTokens != null) meta.put("completion_tokens", completionTokens);
            if (totalTokens != null) meta.put("total_tokens", totalTokens);
        } catch (Exception ignored) {
            // Spring AI not on classpath or API mismatch — skip token extraction
        }
    }
}
