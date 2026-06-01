package com.o11y.sdk;

/**
 * Static bridge for sending runtime status snapshots to the O11y dashboard.
 * Follows the same pattern as {@link O11yTraceBridge}.
 *
 * <p>Usage:
 * <pre>{@code
 * O11yRuntimeBridge.status(sessionId, traceId, "PIPELINE", 50, "Executing layer 2 of 5", null);
 * O11yRuntimeBridge.compression(sessionId, traceId, 85.0, 24, 8);
 * O11yRuntimeBridge.tokenUsage(sessionId, traceId, 12000, 800, 12800);
 * }</pre>
 */
public class O11yRuntimeBridge {

    private static volatile RuntimeStatusReporter reporter;

    public static void setReporter(RuntimeStatusReporter r) {
        reporter = r;
    }

    /**
     * Emit a runtime status for the current execution phase.
     */
    public static void status(String sessionId, String traceId, String phase,
                               int progressPct, String stepDescription,
                               String agentId, String agentName) {
        RuntimeStatusReporter r = reporter;
        if (r == null) return;
        r.report(RuntimeStatus.builder()
                .sessionId(sessionId)
                .traceId(traceId)
                .currentPhase(phase)
                .progressPct(progressPct)
                .stepDescription(stepDescription)
                .agentId(agentId)
                .agentName(agentName)
                .build());
    }

    /**
     * Emit a context compression event.
     */
    public static void compression(String sessionId, String traceId,
                                    double contextUsedPct, int from, int to) {
        RuntimeStatusReporter r = reporter;
        if (r == null) return;
        r.report(RuntimeStatus.builder()
                .sessionId(sessionId)
                .traceId(traceId)
                .currentPhase("AGENT")
                .contextUsedPct(contextUsedPct / 100.0)
                .contextCompressed(true)
                .compressedFrom(from)
                .compressedTo(to)
                .stepDescription("Context compressed: " + from + " messages → " + to + " summary")
                .build());
    }

    /**
     * Emit a token usage snapshot after an LLM call.
     */
    public static void tokenUsage(String sessionId, String traceId,
                                   int promptTokens, int completionTokens, int totalTokens) {
        RuntimeStatusReporter r = reporter;
        if (r == null) return;
        r.report(RuntimeStatus.builder()
                .sessionId(sessionId)
                .traceId(traceId)
                .currentPhase("LLM")
                .tokenUsage(new RuntimeStatus.TokenUsage(promptTokens, completionTokens, totalTokens))
                .build());
    }
}
