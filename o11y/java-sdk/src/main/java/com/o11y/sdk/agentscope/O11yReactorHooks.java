package com.o11y.sdk.agentscope;

import com.o11y.sdk.O11yToolContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import reactor.core.publisher.Hooks;
import reactor.core.publisher.Operators;

import java.util.Map;

/**
 * Installs Reactor operator hooks that propagate O11y trace context
 * from Reactor {@code Context} back to {@link MDC} and {@link O11yToolContext}
 * (ThreadLocal), so that Logback's {@code O11yAppender} can read the
 * correct sessionId / traceId / spanId on whichever thread a reactive
 * operator happens to execute.
 *
 * <p>Without this hook the O11yAppender falls back to
 * {@code session_id="unknown"} on any thread that is not the original
 * HTTP request thread — which is essentially every reactive operator.
 */
public final class O11yReactorHooks {

    private static final Logger log = LoggerFactory.getLogger(O11yReactorHooks.class);
    private static volatile boolean installed;

    private O11yReactorHooks() {}

    public static void install() {
        if (installed) {
            return;
        }
        installed = true;

        Hooks.onEachOperator(O11yReactorContext.KEY,
                Operators.<Object, Object>lift((scannable, sub) ->
                        new MdcRestoringSubscriber<>(sub)));
        log.info("[O11y] Reactor MDC propagation hook installed");
    }

    /**
     * CoreSubscriber wrapper that restores MDC + O11yToolContext from Reactor
     * Context before onSubscribe/onNext/onComplete/onError and clears them
     * on terminal signals.
     */
    private static final class MdcRestoringSubscriber<T>
            implements reactor.core.CoreSubscriber<T> {

        private final reactor.core.CoreSubscriber<? super T> delegate;

        MdcRestoringSubscriber(reactor.core.CoreSubscriber<? super T> delegate) {
            this.delegate = delegate;
        }

        @Override
        public void onSubscribe(org.reactivestreams.Subscription s) {
            try (var ignored = restore()) {
                delegate.onSubscribe(s);
            }
        }

        @Override
        public void onNext(T t) {
            try (var ignored = restore()) {
                delegate.onNext(t);
            }
        }

        @Override
        public void onError(Throwable t) {
            try (var ignored = restore()) {
                delegate.onError(t);
            } finally {
                O11yToolContext.clear();
                MDC.clear();
            }
        }

        @Override
        public void onComplete() {
            try (var ignored = restore()) {
                delegate.onComplete();
            } finally {
                O11yToolContext.clear();
                MDC.clear();
            }
        }

        @Override
        public reactor.util.context.Context currentContext() {
            return delegate.currentContext();
        }

        /**
         * Restore MDC + O11yToolContext from the Reactor Context on the delegate,
         * returning an {@code AutoCloseable} that reinstates the previous state.
         */
        private MDCSnapshot restore() {
            reactor.util.context.ContextView ctxView = delegate.currentContext();
            O11yReactorContext o11yCtx =
                    ctxView.getOrDefault(O11yReactorContext.KEY, null);

            Map<String, String> prevMdc = MDC.getCopyOfContextMap();
            var prevToolCtx = O11yToolContext.get();

            if (o11yCtx != null) {
                O11yToolContext.Context threadCtx = new O11yToolContext.Context(
                        o11yCtx.getSessionId(), o11yCtx.getTraceId());
                threadCtx.setCurrentSpanId(o11yCtx.getCurrentSpanId());
                threadCtx.setTaskId(o11yCtx.getTaskId());
                O11yToolContext.set(threadCtx);

                MDC.put("sessionId", o11yCtx.getSessionId());
                MDC.put("traceId", o11yCtx.getTraceId());
                String spanId = o11yCtx.getCurrentSpanId();
                if (spanId != null) {
                    MDC.put("spanId", spanId);
                }
            }

            return () -> {
                if (prevMdc != null) {
                    MDC.setContextMap(prevMdc);
                } else {
                    MDC.clear();
                }
                if (prevToolCtx != null) {
                    O11yToolContext.set(prevToolCtx);
                } else {
                    O11yToolContext.clear();
                }
            };
        }

        @FunctionalInterface
        private interface MDCSnapshot extends AutoCloseable {
            @Override
            void close();
        }
    }
}
