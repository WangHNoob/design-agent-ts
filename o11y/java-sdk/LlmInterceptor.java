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
        String traceId = SpanContext.getTraceId();
        String sessionId = SpanContext.getSessionId();
        if (traceId == null || sessionId == null) {
            return pjp.proceed();
        }

        String parentSpanId = SpanContext.getCurrentSpanId();
        O11ySpan span = O11ySpan.start(traceId, sessionId, "llm_call", "LLM")
            .withParent(parentSpanId)
            .withInput(pjp.getArgs());

        SpanContext.setCurrentSpanId(span.getId());

        try {
            Object result = pjp.proceed();
            span.end(result);

            Map<String, Object> meta = new HashMap<>();
            if (result instanceof org.springframework.ai.chat.model.ChatResponse) {
                org.springframework.ai.chat.model.ChatResponse resp = (org.springframework.ai.chat.model.ChatResponse) result;
                org.springframework.ai.chat.metadata.Usage usage = resp.getMetadata().getUsage();
                if (usage != null) {
                    meta.put("prompt_tokens", usage.getPromptTokens());
                    meta.put("completion_tokens", usage.getCompletionTokens());
                    meta.put("total_tokens", usage.getTotalTokens());
                }
            }
            span.withMetadata(meta);

            return result;
        } catch (Throwable t) {
            span.fail(t.getMessage());
            throw t;
        } finally {
            reporter.report(span);
            SpanContext.setCurrentSpanId(parentSpanId);
        }
    }
}
