package com.o11y.sdk.log;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Log entry model for O11y observability.
 * Represents a single application log event with trace context.
 */
public class LogEntry {
    private String id;
    private String sessionId;
    private String traceId;
    private String spanId;
    private Instant timestamp;
    private String level;
    private String logger;
    private String message;
    private String thread;
    private String exception;
    private Map<String, Object> metadata;

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private final LogEntry entry = new LogEntry();

        public Builder id(String id) {
            entry.id = id;
            return this;
        }

        public Builder sessionId(String sessionId) {
            entry.sessionId = sessionId;
            return this;
        }

        public Builder traceId(String traceId) {
            entry.traceId = traceId;
            return this;
        }

        public Builder spanId(String spanId) {
            entry.spanId = spanId;
            return this;
        }

        public Builder timestamp(Instant timestamp) {
            entry.timestamp = timestamp;
            return this;
        }

        public Builder level(String level) {
            entry.level = level;
            return this;
        }

        public Builder logger(String logger) {
            entry.logger = logger;
            return this;
        }

        public Builder message(String message) {
            entry.message = message;
            return this;
        }

        public Builder thread(String thread) {
            entry.thread = thread;
            return this;
        }

        public Builder exception(String exception) {
            entry.exception = exception;
            return this;
        }

        public Builder metadata(Map<String, Object> metadata) {
            entry.metadata = metadata;
            return this;
        }

        public LogEntry build() {
            if (entry.id == null) {
                entry.id = UUID.randomUUID().toString();
            }
            if (entry.timestamp == null) {
                entry.timestamp = Instant.now();
            }
            return entry;
        }
    }

    // Getters
    public String getId() { return id; }
    public String getSessionId() { return sessionId; }
    public String getTraceId() { return traceId; }
    public String getSpanId() { return spanId; }
    public Instant getTimestamp() { return timestamp; }
    public String getLevel() { return level; }
    public String getLogger() { return logger; }
    public String getMessage() { return message; }
    public String getThread() { return thread; }
    public String getException() { return exception; }
    public Map<String, Object> getMetadata() { return metadata; }
}
