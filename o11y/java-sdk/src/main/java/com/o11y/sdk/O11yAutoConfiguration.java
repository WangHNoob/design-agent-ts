package com.o11y.sdk;

import com.o11y.sdk.agentscope.O11yReactorHooks;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(prefix = "o11y", name = "enabled", havingValue = "true", matchIfMissing = true)
public class O11yAutoConfiguration {

    static {
        O11yReactorHooks.install();
    }

    @Bean
    @ConditionalOnMissingBean(SpanReporter.class)
    public SpanReporter spanReporter() {
        String endpoint = System.getenv().getOrDefault("O11Y_ENDPOINT", "http://localhost:8000/api/v1/spans/batch");
        return new SpanReporter(endpoint, 50);
    }

    @Bean
    @ConditionalOnMissingBean(RuntimeStatusReporter.class)
    public RuntimeStatusReporter runtimeStatusReporter() {
        String base = System.getenv().getOrDefault("O11Y_ENDPOINT",
                "http://localhost:8000/api/v1/spans/batch");
        String runtimeEndpoint = base.replace("/spans/batch", "/runtime/status");
        return new RuntimeStatusReporter(runtimeEndpoint);
    }

    @Configuration
    @ConditionalOnClass(name = "jakarta.servlet.Filter")
    static class ServletFilterConfig {
        @Bean
        @ConditionalOnMissingBean(O11yFilter.class)
        public O11yFilter o11yFilter() {
            return new O11yFilter();
        }
    }

    @Configuration
    @ConditionalOnClass(name = "org.springframework.web.server.WebFilter")
    static class WebFluxFilterConfig {
        @Bean
        @ConditionalOnMissingBean(O11yWebFilter.class)
        public O11yWebFilter o11yWebFilter() {
            return new O11yWebFilter();
        }
    }

    @Configuration
    @ConditionalOnClass(name = "org.aspectj.lang.annotation.Aspect")
    static class AspectConfig {
        @Bean
        @ConditionalOnMissingBean(LlmInterceptor.class)
        public LlmInterceptor llmInterceptor(SpanReporter reporter) {
            return new LlmInterceptor(reporter);
        }

        @Bean
        @ConditionalOnMissingBean(ToolAspect.class)
        public ToolAspect toolAspect(SpanReporter reporter) {
            return new ToolAspect(reporter);
        }
    }

    @Configuration
    @ConditionalOnClass(name = "io.agentscope.core.tracing.Tracer")
    static class AgentScopeTracerConfig {
        @Bean
        @ConditionalOnMissingBean(com.o11y.sdk.agentscope.AgentScopeTracer.class)
        public com.o11y.sdk.agentscope.AgentScopeTracer agentScopeTracer(SpanReporter reporter) {
            return new com.o11y.sdk.agentscope.AgentScopeTracer(reporter);
        }
    }
}
