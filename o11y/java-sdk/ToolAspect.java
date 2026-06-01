package com.o11y.sdk;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Aspect
@Component
public class ToolAspect {

    private final SpanReporter reporter;

    public ToolAspect(SpanReporter reporter) {
        this.reporter = reporter;
    }

    @Around("@annotation(org.springframework.ai.tool.annotation.Tool)")
    public Object aroundTool(ProceedingJoinPoint pjp) throws Throwable {
        String traceId = SpanContext.getTraceId();
        String sessionId = SpanContext.getSessionId();
        if (traceId == null || sessionId == null) {
            return pjp.proceed();
        }

        String toolName = pjp.getSignature().getName();
        String parentSpanId = SpanContext.getCurrentSpanId();

        Map<String, Object> input = new HashMap<>();
        input.put("args", pjp.getArgs());

        O11ySpan span = O11ySpan.start(traceId, sessionId, toolName, "TOOL")
            .withParent(parentSpanId)
            .withInput(input);

        SpanContext.setCurrentSpanId(span.getId());

        try {
            Object result = pjp.proceed();
            span.end(result);
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
