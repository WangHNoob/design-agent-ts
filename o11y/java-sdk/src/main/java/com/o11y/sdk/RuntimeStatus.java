package com.o11y.sdk;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.time.Instant;

/**
 * Runtime status snapshot sent from the Java agent system to the O11y backend
 * for real-time dashboard display (progress bar, token meter, compression log).
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RuntimeStatus {

    private String sessionId;
    private String traceId;
    private Instant timestamp;
    private String currentPhase;
    private int progressPct;
    private String agentId;
    private String agentName;
    private String stepDescription;
    private double contextUsedPct;
    private boolean contextCompressed;
    private Integer compressedFrom;
    private Integer compressedTo;
    private TokenUsage tokenUsage;

    public RuntimeStatus() {}

    // ── Builder ──────────────────────────────────────────────────

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private final RuntimeStatus s = new RuntimeStatus();
        public Builder sessionId(String v) { s.sessionId = v; return this; }
        public Builder traceId(String v) { s.traceId = v; return this; }
        public Builder timestamp(Instant v) { s.timestamp = v; return this; }
        public Builder currentPhase(String v) { s.currentPhase = v; return this; }
        public Builder progressPct(int v) { s.progressPct = v; return this; }
        public Builder agentId(String v) { s.agentId = v; return this; }
        public Builder agentName(String v) { s.agentName = v; return this; }
        public Builder stepDescription(String v) { s.stepDescription = v; return this; }
        public Builder contextUsedPct(double v) { s.contextUsedPct = v; return this; }
        public Builder contextCompressed(boolean v) { s.contextCompressed = v; return this; }
        public Builder compressedFrom(Integer v) { s.compressedFrom = v; return this; }
        public Builder compressedTo(Integer v) { s.compressedTo = v; return this; }
        public Builder tokenUsage(TokenUsage v) { s.tokenUsage = v; return this; }
        public RuntimeStatus build() { return s; }
    }

    // ── Getters ──────────────────────────────────────────────────

    public String getSessionId() { return sessionId; }
    public String getTraceId() { return traceId; }
    public Instant getTimestamp() { return timestamp; }
    public String getCurrentPhase() { return currentPhase; }
    public int getProgressPct() { return progressPct; }
    public String getAgentId() { return agentId; }
    public String getAgentName() { return agentName; }
    public String getStepDescription() { return stepDescription; }
    public double getContextUsedPct() { return contextUsedPct; }
    public boolean isContextCompressed() { return contextCompressed; }
    public Integer getCompressedFrom() { return compressedFrom; }
    public Integer getCompressedTo() { return compressedTo; }
    public TokenUsage getTokenUsage() { return tokenUsage; }

    // ── Inner types ──────────────────────────────────────────────

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public static class TokenUsage {
        private int promptTokens;
        private int completionTokens;
        private int totalTokens;

        public TokenUsage() {}
        public TokenUsage(int prompt, int completion, int total) {
            this.promptTokens = prompt;
            this.completionTokens = completion;
            this.totalTokens = total;
        }
        public int getPromptTokens() { return promptTokens; }
        public int getCompletionTokens() { return completionTokens; }
        public int getTotalTokens() { return totalTokens; }
    }
}
