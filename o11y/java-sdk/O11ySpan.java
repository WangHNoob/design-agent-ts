package com.o11y.sdk;

import java.time.Instant;
import java.util.Map;

public class O11ySpan {
    private String id;
    private String traceId;
    private String sessionId;
    private String parentSpanId;
    private String name;
    private String spanType;
    private Instant startTime;
    private Instant endTime;
    private Long durationMs;
    private Object inputData;
    private Object outputData;
    private Map<String, Object> metadata;
    private String status = "ok";

    public static O11ySpan start(String traceId, String sessionId, String name, String spanType) {
        O11ySpan span = new O11ySpan();
        span.id = java.util.UUID.randomUUID().toString();
        span.traceId = traceId;
        span.sessionId = sessionId;
        span.name = name;
        span.spanType = spanType;
        span.startTime = Instant.now();
        return span;
    }

    public O11ySpan withParent(String parentSpanId) {
        this.parentSpanId = parentSpanId;
        return this;
    }

    public O11ySpan withInput(Object input) {
        this.inputData = input;
        return this;
    }

    public O11ySpan withMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
        return this;
    }

    public void end(Object output) {
        this.endTime = Instant.now();
        this.outputData = output;
        this.durationMs = java.time.Duration.between(startTime, endTime).toMillis();
    }

    public void fail(String error) {
        this.endTime = Instant.now();
        this.status = "error";
        this.outputData = error;
        this.durationMs = java.time.Duration.between(startTime, endTime).toMillis();
    }

    // Getters
    public String getId() { return id; }
    public String getTraceId() { return traceId; }
    public String getSessionId() { return sessionId; }
    public String getParentSpanId() { return parentSpanId; }
    public String getName() { return name; }
    public String getSpanType() { return spanType; }
    public Instant getStartTime() { return startTime; }
    public Instant getEndTime() { return endTime; }
    public Long getDurationMs() { return durationMs; }
    public Object getInputData() { return inputData; }
    public Object getOutputData() { return outputData; }
    public Map<String, Object> getMetadata() { return metadata; }
    public String getStatus() { return status; }
}
