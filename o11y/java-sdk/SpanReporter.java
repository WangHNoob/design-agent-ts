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
    private final String endpoint;
    private final HttpClient client;
    private final ObjectMapper mapper;
    private final BlockingQueue<O11ySpan> queue;
    private final ScheduledExecutorService executor;
    private final int batchSize;

    public SpanReporter() {
        this(DEFAULT_ENDPOINT, 50);
    }

    public SpanReporter(String endpoint, int batchSize) {
        this.endpoint = endpoint;
        this.batchSize = batchSize;
                this.client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .build();
        this.mapper = new ObjectMapper();
        this.mapper.registerModule(new JavaTimeModule());
        this.mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        this.mapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        this.queue = new LinkedBlockingQueue<>();
        this.executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "o11y-reporter");
            t.setDaemon(true);
            return t;
        });
        this.executor.scheduleAtFixedRate(this::flush, 1, 1, TimeUnit.SECONDS);
    }

    public void report(O11ySpan span) {
        queue.offer(span);
        if (queue.size() >= batchSize) {
            flush();
        }
    }

    private synchronized void flush() {
        if (queue.isEmpty()) return;

        List<O11ySpan> batch = new java.util.ArrayList<>();
        queue.drainTo(batch, batchSize);

        try {
            String json = mapper.writeValueAsString(new BatchPayload(batch));
            if (json == null || json.isEmpty()) {
                System.err.println("[O11y] WARN: serialized JSON is empty or null, skipping flush");
                return;
            }
            System.err.println("[O11y] Flushing " + batch.size() + " spans to " + endpoint + ", JSON length=" + json.length());
            System.err.println("[O11y] JSON preview: " + (json.length() > 500 ? json.substring(0, 500) : json));
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

            client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenAccept(resp -> {
                    if (resp.statusCode() >= 300) {
                        System.err.println("O11y report failed: " + resp.statusCode() + " body=[" + resp.body() + "]");
                    }
                })
                .exceptionally(ex -> {
                    System.err.println("O11y report error: " + ex.getMessage());
                    return null;
                });
        } catch (Exception e) {
            System.err.println("O11y serialize error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void shutdown() {
        executor.shutdown();
        flush();
    }

    private static class BatchPayload {
        public List<O11ySpan> spans;
        public BatchPayload(List<O11ySpan> spans) { this.spans = spans; }
    }
}
