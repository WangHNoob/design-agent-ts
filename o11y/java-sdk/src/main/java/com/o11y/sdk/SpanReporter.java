package com.o11y.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.*;

public class SpanReporter {
    private static final String DEFAULT_ENDPOINT = "http://localhost:8000/api/v1/spans/batch";
    private static final int MAX_QUEUE = 2000;

    private static final ObjectMapper SHARED_MAPPER = new ObjectMapper();
    static {
        SHARED_MAPPER.registerModule(new JavaTimeModule());
        SHARED_MAPPER.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        SHARED_MAPPER.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    }

    private static final HttpClient SHARED_CLIENT = O11yHttpClient.INSTANCE;

    private final String endpoint;
    private final BlockingQueue<O11ySpan> queue;
    private final ScheduledExecutorService executor;
    private final int batchSize;
    private volatile boolean debug;
    private volatile CompletableFuture<Void> lastFlushFuture;

    public SpanReporter() {
        this(DEFAULT_ENDPOINT, 50);
    }

    public SpanReporter(String endpoint, int batchSize) {
        // Windows: HttpClient resolves "localhost" to ::1 (IPv6) first, but uvicorn
        // typically binds only to 127.0.0.1 (IPv4), causing ConnectException.
        this.endpoint = endpoint.replace("localhost", "127.0.0.1");
        this.batchSize = batchSize;
        this.queue = new LinkedBlockingQueue<>(MAX_QUEUE);
        this.executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "o11y-reporter");
            t.setDaemon(true);
            return t;
        });
        this.executor.scheduleWithFixedDelay(this::flush, 2, 2, TimeUnit.SECONDS);
    }

    public void setDebug(boolean debug) {
        this.debug = debug;
    }

    public void report(O11ySpan span) {
        if (!queue.offer(span)) {
            queue.poll(); // drop oldest
            queue.offer(span);
        }
        if (queue.size() >= batchSize) {
            executor.submit(this::flush);
        }
    }

    private void flush() {
        if (queue.isEmpty()) return;

        List<O11ySpan> batch = new java.util.ArrayList<>();
        queue.drainTo(batch, batchSize);

        if (batch.isEmpty()) return;

        // Serialize outside any lock
        String json;
        try {
            json = SHARED_MAPPER.writeValueAsString(new BatchPayload(batch));
        } catch (Exception e) {
            System.err.println("[O11y] Serialize error: " + e.getMessage());
            return;
        }

        if (debug) {
            System.err.println("[O11y] Flushing " + batch.size() + " spans to " + endpoint + ", JSON length=" + json.length());
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .timeout(java.time.Duration.ofSeconds(10))
                .build();

        CompletableFuture<Void> future = SHARED_CLIENT.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenAccept(resp -> {
                    if (resp.statusCode() >= 300) {
                        System.err.println("[O11y] Report failed: " + resp.statusCode());
                    }
                })
                .exceptionally(ex -> {
                    System.err.println("[O11y] Report error: " + ex.getMessage());
                    return null;
                });
        lastFlushFuture = future;
    }

    public void shutdown() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(2, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
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
                System.err.println("[O11y] Shutdown: final flush did not complete within 5s: " + e.getMessage());
            }
        }
    }

    private static class BatchPayload {
        public List<O11ySpan> spans;
        public BatchPayload(List<O11ySpan> spans) { this.spans = spans; }
    }
}
