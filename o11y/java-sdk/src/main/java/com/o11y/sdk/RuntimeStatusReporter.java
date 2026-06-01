package com.o11y.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Fire-and-forget HTTP reporter for runtime status snapshots.
 * Sends progress, context usage, compression events, and token counts
 * to the O11y backend for real-time dashboard display.
 */
public class RuntimeStatusReporter {

    private static final Logger log = LoggerFactory.getLogger(RuntimeStatusReporter.class);

    private static final String DEFAULT_ENDPOINT = "http://localhost:8000/api/v1/runtime/status";

    private static final ObjectMapper MAPPER = new ObjectMapper();
    static {
        MAPPER.registerModule(new JavaTimeModule());
        MAPPER.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        MAPPER.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    }

    private static final HttpClient CLIENT = O11yHttpClient.INSTANCE;

    private final String endpoint;

    public RuntimeStatusReporter() {
        this(DEFAULT_ENDPOINT);
    }

    public RuntimeStatusReporter(String endpoint) {
        this.endpoint = endpoint;
    }

    /**
     * Report a runtime status snapshot (fire-and-forget, non-blocking).
     * Failures are silently dropped to avoid disrupting the main execution.
     */
    public void report(RuntimeStatus status) {
        try {
            String json = MAPPER.writeValueAsString(status);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .timeout(Duration.ofSeconds(5))
                    .build();

            CLIENT.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                    .exceptionally(ex -> {
                        log.debug("Runtime status send failed: {}", ex.getMessage());
                        return null;
                    });
        } catch (Exception e) {
            log.debug("Failed to serialize runtime status: {}", e.getMessage());
        }
    }
}
