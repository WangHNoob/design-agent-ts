package com.o11y.sdk.agentscope;

import reactor.util.context.Context;
import reactor.util.context.ContextView;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.UUID;
import java.util.function.Function;

/**
 * Single source of truth for O11y trace context in reactive chains.
 * Stored in Reactor {@link Context} and propagated across async boundaries
 * without relying on ThreadLocal.
 *
 * <p>Usage in reactive chains:
 * <pre>{@code
 * return Mono.deferContextual(ctxView -> {
 *     O11yReactorContext octx = O11yReactorContext.fromContextView(ctxView);
 *     // ... create spans using octx ...
 *     return businessLogic().contextWrite(octx.contextWriter());
 * });
 * }</pre>
 *
 * <p>For synchronous @Tool method execution, the {@code AgentScopeTracer.runWithContext}
 * method bridges this context to {@link com.o11y.sdk.O11yToolContext} (ThreadLocal) for
 * the duration of the tool call only.
 */
public class O11yReactorContext {

    public static final String KEY = "o11y.context";

    private final String traceId;
    private final String sessionId;
    private final String taskId;
    private final Deque<String> spanStack;

    private O11yReactorContext(String traceId, String sessionId, String taskId, Deque<String> spanStack) {
        this.traceId = traceId;
        this.sessionId = sessionId;
        this.taskId = taskId;
        this.spanStack = spanStack;
    }

    // ── Factory methods ──────────────────────────────────────────

    public static O11yReactorContext root(String traceId, String sessionId) {
        return new O11yReactorContext(
                traceId != null ? traceId : UUID.randomUUID().toString(),
                sessionId != null ? sessionId : "unknown",
                null,
                new ArrayDeque<>()
        );
    }

    public static O11yReactorContext from(String traceId, String sessionId) {
        return new O11yReactorContext(
                traceId != null ? traceId : "unknown",
                sessionId != null ? sessionId : "unknown",
                null,
                new ArrayDeque<>()
        );
    }

    public static O11yReactorContext from(String traceId, String sessionId, String taskId) {
        return new O11yReactorContext(
                traceId != null ? traceId : "unknown",
                sessionId != null ? sessionId : "unknown",
                taskId,
                new ArrayDeque<>()
        );
    }

    /**
     * Read O11yReactorContext from a Reactor ContextView.
     * Returns null if not present (caller decides how to handle missing context).
     */
    public static O11yReactorContext fromContextView(ContextView ctxView) {
        return ctxView.getOrDefault(KEY, null);
    }

    // ── Span stack manipulation (returns NEW instance — immutable) ─

    public O11yReactorContext fork() {
        return new O11yReactorContext(traceId, sessionId, taskId, new ArrayDeque<>(spanStack));
    }

    public O11yReactorContext pushSpan(String spanId) {
        Deque<String> newStack = new ArrayDeque<>(spanStack);
        newStack.push(spanId);
        return new O11yReactorContext(traceId, sessionId, taskId, newStack);
    }

    public O11yReactorContext popSpan() {
        if (spanStack.isEmpty()) return this;
        Deque<String> newStack = new ArrayDeque<>(spanStack);
        newStack.pop();
        return new O11yReactorContext(traceId, sessionId, taskId, newStack);
    }

    public O11yReactorContext withTaskId(String newTaskId) {
        return new O11yReactorContext(traceId, sessionId, newTaskId, new ArrayDeque<>(spanStack));
    }

    // ── Accessors ─────────────────────────────────────────────────

    public String getTraceId() { return traceId; }
    public String getSessionId() { return sessionId; }
    public String getTaskId() { return taskId; }

    public String getCurrentSpanId() {
        return spanStack.isEmpty() ? null : spanStack.peek();
    }

    public boolean isEmpty() {
        return spanStack.isEmpty();
    }

    // ── Reactor Context integration ───────────────────────────────

    /**
     * Returns a function that writes this context into a Reactor Context,
     * for use with {@code .contextWrite(octx.contextWriter())}.
     */
    public Function<Context, Context> contextWriter() {
        return ctx -> ctx.put(KEY, this);
    }
}
