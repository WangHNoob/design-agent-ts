package com.o11y.sdk;

import com.o11y.sdk.agentscope.O11yReactorContext;

import java.util.Map;
import java.util.UUID;

/**
 * Manual instrumentation bridge for O11y spans within reactive chains.
 *
 * <p>All methods require an explicit {@link O11yReactorContext} parameter
 * (obtained via {@code Mono.deferContextual(ctx -> O11yReactorContext.fromContextView(ctx))}).
 * No ThreadLocal is used.
 *
 * <p>Usage:
 * <pre>{@code
 * return Mono.deferContextual(ctxView -> {
 *     O11yReactorContext octx = O11yReactorContext.fromContextView(ctxView);
 *     O11ySpan span = O11yTraceBridge.startSpan("myOp", "STEP", octx, input);
 *     return businessLogic()
 *         .doOnSuccess(result -> O11yTraceBridge.endSpan(span, output))
 *         .doOnError(e -> O11yTraceBridge.failSpan(span, e.getMessage()))
 *         .doOnCancel(() -> O11yTraceBridge.failSpan(span, "cancelled"));
 * });
 * }</pre>
 */
public class O11yTraceBridge {

    private static volatile SpanReporter reporter;

    public static void setReporter(SpanReporter r) {
        reporter = r;
    }

    public static SpanReporter getReporter() {
        return reporter;
    }

    /**
     * Start a new span as a child of the current span in the given context.
     *
     * @param name     span name
     * @param spanType span type (LLM, TOOL, AGENT_CHAIN, PIPELINE, STEP, etc.)
     * @param octx     trace context (from Reactor Context)
     * @param input    input data (serializable, nullable)
     * @return the started span
     */
    public static O11ySpan startSpan(String name, String spanType,
                                      O11yReactorContext octx, Object input) {
        if (octx == null) {
            return O11ySpan.start("unknown", "unknown", name, spanType)
                    .withInput(input);
        }
        O11ySpan span = O11ySpan.start(octx.getTraceId(), octx.getSessionId(), name, spanType)
                .withParent(octx.getCurrentSpanId())
                .withInput(input);
        return span;
    }

    /**
     * End a span successfully and queue it for reporting.
     */
    public static void endSpan(O11ySpan span, Object output) {
        span.end(output);
        report(span);
    }

    /**
     * End a span with an error status and queue it for reporting.
     */
    public static void failSpan(O11ySpan span, String error) {
        span.fail(error);
        report(span);
    }

    private static void report(O11ySpan span) {
        SpanReporter r = reporter;
        if (r != null) {
            r.report(span);
        }
    }

    /**
     * Start a span on a brand-new trace (independent of the current request trace).
     * Used for revision/re-execution traces that should be compared independently.
     */
    public static O11ySpan startSpanOnNewTrace(String name, String spanType,
                                                String sessionId, Object input) {
        String newTraceId = UUID.randomUUID().toString();
        if (sessionId == null) {
            sessionId = "unknown";
        }
        return O11ySpan.start(newTraceId, sessionId, name, spanType)
                .withInput(input);
    }

    /**
     * Start a span from O11yToolContext (ThreadLocal).
     * For synchronous methods called from within reactive chains where
     * O11yReactorHooks has already restored the context from Reactor Context.
     */
    public static O11ySpan startSpanFromToolContext(String name, String spanType, Object input) {
        O11yToolContext.Context tc = O11yToolContext.get();
        return O11ySpan.start(
                tc != null ? tc.getTraceId() : "unknown",
                tc != null ? tc.getSessionId() : "unknown",
                name, spanType)
                .withParent(tc != null ? tc.getCurrentSpanId() : null)
                .withInput(input);
    }
}
