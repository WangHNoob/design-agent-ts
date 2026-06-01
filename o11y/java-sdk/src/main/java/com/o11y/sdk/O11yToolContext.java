package com.o11y.sdk;

/**
 * Minimal ThreadLocal context for synchronous code paths
 * (logback appender, AOP interceptors, @Tool methods).
 *
 * <p>This is the ONLY ThreadLocal in the O11y SDK. It is strictly scoped:
 * <ul>
 *   <li>{@link com.o11y.sdk.agentscope.AgentScopeTracer#runWithContext} sets it before
 *       a synchronous @Tool method executes and clears it afterwards.</li>
 *   <li>{@link com.o11y.sdk.agentscope.O11yReactorHooks} restores it from Reactor
 *       Context on each reactive operator boundary.</li>
 *   <li>{@link O11yWebFilter} sets it on the initial filter thread.</li>
 * </ul>
 *
 * <p>All reactive chain code should use {@link com.o11y.sdk.agentscope.O11yReactorContext}
 * via {@code Mono.deferContextual()} instead.
 */
public class O11yToolContext {
    private static final ThreadLocal<Context> CURRENT = new ThreadLocal<>();

    public static class Context {
        private final String sessionId;
        private final String traceId;
        private String currentSpanId;
        private String taskId;

        public Context(String sessionId, String traceId) {
            this.sessionId = sessionId;
            this.traceId = traceId;
        }

        public String getSessionId() { return sessionId; }
        public String getTraceId() { return traceId; }
        public String getCurrentSpanId() { return currentSpanId; }
        public void setCurrentSpanId(String spanId) { this.currentSpanId = spanId; }
        public String getTaskId() { return taskId; }
        public void setTaskId(String taskId) { this.taskId = taskId; }
    }

    public static void set(Context ctx) { CURRENT.set(ctx); }

    public static Context get() { return CURRENT.get(); }

    public static Context from(String traceId, String sessionId) {
        Context ctx = new Context(sessionId, traceId);
        CURRENT.set(ctx);
        return ctx;
    }

    public static void clear() { CURRENT.remove(); }

    public static String getTraceId() {
        Context ctx = CURRENT.get();
        return ctx != null ? ctx.getTraceId() : null;
    }

    public static String getSessionId() {
        Context ctx = CURRENT.get();
        return ctx != null ? ctx.getSessionId() : null;
    }

    public static String getCurrentSpanId() {
        Context ctx = CURRENT.get();
        return ctx != null ? ctx.getCurrentSpanId() : null;
    }

    public static void setCurrentSpanId(String spanId) {
        Context ctx = CURRENT.get();
        if (ctx != null) ctx.setCurrentSpanId(spanId);
    }

    public static String getTaskId() {
        Context ctx = CURRENT.get();
        return ctx != null ? ctx.getTaskId() : null;
    }

    public static void setTaskId(String taskId) {
        Context ctx = CURRENT.get();
        if (ctx != null) ctx.setTaskId(taskId);
    }
}
