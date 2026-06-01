package com.o11y.sdk;

import com.o11y.sdk.agentscope.O11yReactorContext;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * WebFlux filter that initializes O11y trace context on incoming requests.
 *
 * <p>Sets both Reactor {@code Context} (for reactive agent/tool tracing) and
 * {@link O11yToolContext} + {@link MDC} (for the Logback {@code O11yAppender}
 * on the current filter thread). The {@code O11yReactorHooks} automatically
 * restores O11yToolContext + MDC from Reactor Context on each operator boundary.
 */
@Order(Ordered.HIGHEST_PRECEDENCE + 100)
public class O11yWebFilter implements WebFilter {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String sessionId = exchange.getRequest().getHeaders().getFirst("X-Session-Id");
        if (sessionId == null || sessionId.isBlank()) {
            sessionId = "unknown";
        }
        String traceId = UUID.randomUUID().toString();

        O11yReactorContext o11yCtx = O11yReactorContext.root(traceId, sessionId);

        // Set on the current filter thread so logs emitted before the first
        // reactive operator boundary carry the correct context.
        O11yToolContext.from(traceId, sessionId);
        MDC.put("sessionId", sessionId);
        MDC.put("traceId", traceId);

        return chain.filter(exchange)
                .contextWrite(o11yCtx.contextWriter())
                .doFinally(sig -> {
                    O11yToolContext.clear();
                    MDC.clear();
                });
    }
}
