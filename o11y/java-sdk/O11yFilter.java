package com.o11y.sdk;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

@Component
public class O11yFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;

        String sessionId = req.getHeader("X-Session-Id");
        if (sessionId == null) {
            sessionId = UUID.randomUUID().toString();
        }
        String traceId = UUID.randomUUID().toString();

        SpanContext.Context ctx = new SpanContext.Context(sessionId, traceId);
        SpanContext.set(ctx);

        try {
            chain.doFilter(request, response);
        } finally {
            SpanContext.clear();
        }
    }
}
