package com.o11y.sdk.logback;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.StackTraceElementProxy;
import ch.qos.logback.core.AppenderBase;
import com.o11y.sdk.O11yToolContext;
import com.o11y.sdk.log.LogEntry;
import com.o11y.sdk.log.LogReporter;
import org.slf4j.MDC;

import java.time.Instant;

/**
 * Logback appender that sends log events to O11y backend.
 * Automatically attaches trace context (sessionId, traceId, spanId) from O11yToolContext.
 */
public class O11yAppender extends AppenderBase<ILoggingEvent> {

    private String endpoint = "http://localhost:8000/api/v1/logs/batch";
    private LogReporter reporter;

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    @Override
    public void start() {
        if (endpoint == null || endpoint.isEmpty()) {
            addError("O11yAppender: endpoint is not set");
            return;
        }

        try {
            reporter = new LogReporter(endpoint);
            super.start();
            addInfo("O11yAppender started (endpoint=" + endpoint + ")");
        } catch (Exception e) {
            addError("Failed to start O11yAppender", e);
        }
    }

    @Override
    public void stop() {
        if (reporter != null) {
            reporter.shutdown();
        }
        super.stop();
    }

    @Override
    protected void append(ILoggingEvent event) {
        if (reporter == null) {
            return;
        }

        try {
            O11yToolContext.Context ctx = O11yToolContext.get();

            // Try O11yToolContext ThreadLocal first, then MDC, then fallback
            String sessionId = ctx != null ? ctx.getSessionId() : null;
            String traceId = ctx != null ? ctx.getTraceId() : null;
            String spanId = ctx != null ? ctx.getCurrentSpanId() : null;

            if (sessionId == null) sessionId = MDC.get("sessionId");
            if (traceId == null) traceId = MDC.get("traceId");
            if (spanId == null) spanId = MDC.get("spanId");

            LogEntry log = LogEntry.builder()
                    .sessionId(sessionId != null ? sessionId : "unknown")
                    .traceId(traceId)
                    .spanId(spanId)
                    .timestamp(Instant.ofEpochMilli(event.getTimeStamp()))
                    .level(event.getLevel().toString())
                    .logger(event.getLoggerName())
                    .message(event.getFormattedMessage())
                    .thread(event.getThreadName())
                    .exception(formatException(event.getThrowableProxy()))
                    .build();

            reporter.report(log);
        } catch (Exception e) {
            addError("Failed to append log event", e);
        }
    }

    private String formatException(IThrowableProxy proxy) {
        if (proxy == null) {
            return null;
        }

        StringBuilder sb = new StringBuilder();
        sb.append(proxy.getClassName()).append(": ").append(proxy.getMessage()).append("\n");

        for (StackTraceElementProxy step : proxy.getStackTraceElementProxyArray()) {
            sb.append("\tat ").append(step.toString()).append("\n");
        }

        if (proxy.getCause() != null) {
            sb.append("Caused by: ").append(formatException(proxy.getCause()));
        }

        return sb.toString();
    }
}
