package com.o11y.sdk;

import java.net.http.HttpClient;
import java.time.Duration;

/**
 * Shared HTTP/1.1 client for all O11y reporters.
 * Single instance avoids connection pool conflicts between SpanReporter and LogReporter.
 */
public final class O11yHttpClient {
    private O11yHttpClient() {}

    static {
        // Prevent ClosedChannelException from server-side connection closure.
        // JDK HttpClient pools HTTP/1.1 connections indefinitely by default;
        // without a TTL, stale connections persist after uvicorn closes idle
        // keep-alive connections, causing the next write to fail.
        // Setting this to 60s means the client proactively evicts idle connections
        // before the server has a chance to close them.
        System.setProperty("jdk.httpclient.keepalive.timeout", "60");
    }

    public static final HttpClient INSTANCE = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
}
