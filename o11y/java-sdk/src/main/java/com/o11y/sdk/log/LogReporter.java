package com.o11y.sdk.log;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.o11y.sdk.O11yHttpClient;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Asynchronous batch log reporter for O11y.
 * Queues log entries and flushes them periodically or when batch size is reached.
 */
public class LogReporter {
    private static final Logger log = LoggerFactory.getLogger(LogReporter.class);

    private static final ObjectMapper SHARED_MAPPER = new ObjectMapper();
    static {
        SHARED_MAPPER.registerModule(new JavaTimeModule());
        SHARED_MAPPER.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        SHARED_MAPPER.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    }

    private static final HttpClient SHARED_CLIENT = O11yHttpClient.INSTANCE;

    private final BlockingQueue<LogEntry> queue = new LinkedBlockingQueue<>(1000);
    private final String endpoint;
    private final ScheduledExecutorService scheduler;
    private volatile CompletableFuture<Void> lastFlushFuture;

    public LogReporter(String endpoint) {
        this.endpoint = endpoint;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "o11y-log-reporter");
            t.setDaemon(true);
            return t;
        });
        this.scheduler.scheduleWithFixedDelay(this::flush, 2, 2, TimeUnit.SECONDS);
        log.info("LogReporter started (endpoint={}, flushInterval=2s)", this.endpoint);
    }

    /**
     * Report a log entry (non-blocking).
     * If queue is full, drops the oldest entry.
     */
    public void report(LogEntry entry) {
        if (!queue.offer(entry)) {
            queue.poll();
            queue.offer(entry);
        }
        // Trigger immediate flush when batch threshold is reached,
        // preventing connection idle timeout (same behavior as SpanReporter).
        if (queue.size() >= 100) {
            scheduler.submit(this::flush);
        }
    }

    /**
     * Flush queued logs to backend (up to 100 entries per batch).
     */
    public void flush() {
        List<LogEntry> batch = new ArrayList<>();
        queue.drainTo(batch, 100);

        if (batch.isEmpty()) {
            return;
        }

        sendBatch(batch);
    }

    private static final int MAX_RETRIES = 2;
    private static final long RETRY_DELAY_MS = 500;

    private void sendBatch(List<LogEntry> logs) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("logs", logs);

        String json;
        try {
            json = SHARED_MAPPER.writeValueAsString(payload);
        } catch (Exception e) {
            log.warn("Failed to serialize log batch: {}", e.getMessage());
            return;
        }

        lastFlushFuture = sendWithRetry(json, 0);
    }

    private CompletableFuture<Void> sendWithRetry(String json, int attempt) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .timeout(Duration.ofSeconds(5))
                .build();

        return SHARED_CLIENT.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenAccept(resp -> {
                    if (resp.statusCode() >= 300) {
                        log.warn("Log batch rejected: status={}, body={}", resp.statusCode(), resp.body());
                    }
                })
                .exceptionallyCompose(ex -> {
                    Throwable root = ex;
                    while (root.getCause() != null) root = root.getCause();

                    boolean isConnectionError = root instanceof java.nio.channels.ClosedChannelException
                            || root instanceof java.net.ConnectException
                            || (root.getMessage() != null && root.getMessage().contains("Connection refused"));

                    if (isConnectionError && attempt < MAX_RETRIES) {
                        log.debug("Log batch retry {}/{} for endpoint {}: {}", attempt + 1, MAX_RETRIES, endpoint, root);
                        return CompletableFuture.runAsync(() -> {
                            try {
                                Thread.sleep(RETRY_DELAY_MS);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                            }
                        }).thenCompose(v -> sendWithRetry(json, attempt + 1));
                    }

                    log.warn("Log batch send failed (endpoint={}): {}", endpoint, root.toString());
                    return CompletableFuture.completedFuture(null);
                });
    }

    public void shutdown() {
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(2, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
        // Final drain
        flush();
        // Wait for the final HTTP request to complete
        CompletableFuture<Void> f = lastFlushFuture;
        if (f != null) {
            try {
                f.get(5, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.warn("Shutdown: final flush did not complete within 5s: {}", e.getMessage());
            }
        }
    }
}
