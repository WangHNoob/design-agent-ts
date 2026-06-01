package com.o11y.sdk;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class O11yAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public SpanReporter spanReporter() {
        String endpoint = System.getenv().getOrDefault("O11Y_ENDPOINT", "http://localhost:8000/api/v1/spans/batch");
        return new SpanReporter(endpoint, 50);
    }

    @Bean
    @ConditionalOnMissingBean
    public O11yFilter o11yFilter() {
        return new O11yFilter();
    }

    @Bean
    @ConditionalOnMissingBean
    public LlmInterceptor llmInterceptor(SpanReporter reporter) {
        return new LlmInterceptor(reporter);
    }

    @Bean
    @ConditionalOnMissingBean
    public ToolAspect toolAspect(SpanReporter reporter) {
        return new ToolAspect(reporter);
    }
}
