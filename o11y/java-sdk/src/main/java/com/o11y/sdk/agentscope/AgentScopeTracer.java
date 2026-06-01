package com.o11y.sdk.agentscope;

import com.o11y.sdk.O11ySpan;
import com.o11y.sdk.O11yToolContext;
import com.o11y.sdk.SpanReporter;
import io.agentscope.core.agent.AgentBase;
import io.agentscope.core.formatter.AbstractBaseFormatter;
import io.agentscope.core.message.ContentBlock;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.model.ChatModelBase;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.ChatUsage;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.ToolSchema;
import io.agentscope.core.tool.ToolCallParam;
import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tracing.Tracer;

import org.slf4j.MDC;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.util.context.ContextView;

/**
 * O11y Tracer implementation for AgentScope-Java.
 *
 * <p>Integrates O11y observability into AgentScope by implementing the
 * {@link Tracer} interface. Trace context is propagated exclusively through
 * Reactor Context — no ThreadLocal reads in reactive chains.
 *
 * <p>The ONLY ThreadLocal usage is in {@link #runWithContext}, which temporarily
 * bridges Reactor Context → {@link O11yToolContext} for synchronous @Tool methods.
 */
public class AgentScopeTracer implements Tracer {

    private final SpanReporter reporter;

    public AgentScopeTracer(SpanReporter reporter) {
        this.reporter = reporter;
    }

    @Override
    public Mono<Msg> callAgent(
            AgentBase instance, List<Msg> inputMessages, Supplier<Mono<Msg>> agentCall) {
        return Mono.deferContextual(ctxView -> {
            O11yReactorContext o11yCtx = getOrCreateContext(ctxView);
            if (o11yCtx == null) {
                return agentCall.get();
            }

            Map<String, Object> extraMeta = new HashMap<>();
            String agentId = instance.getAgentId();
            extraMeta.put("agentId", agentId);
            extraMeta.put("inputCount", inputMessages.size());

            for (Msg msg : inputMessages) {
                if (msg.getMetadata() != null) {
                    copyIfPresent(msg.getMetadata(), extraMeta, "taskId");
                    copyIfPresent(msg.getMetadata(), extraMeta, "domain");
                    copyIfPresent(msg.getMetadata(), extraMeta, "mode");
                    copyIfPresent(msg.getMetadata(), extraMeta, "role");
                }
            }

            String spanType = determineAgentSpanType(agentId);

            // Reflectively read promptVersion from agent instance if available
            String promptVersion = tryGetPromptVersion(instance);
            if (promptVersion != null) {
                extraMeta.put("prompt_version", promptVersion);
            }

            O11ySpan span = startSpan(o11yCtx, instance.getName(), spanType, extraMeta);
            span.withInput(inputMessages);

            O11yReactorContext childCtx = o11yCtx.pushSpan(span.getId());

            return agentCall.get()
                    .doOnSuccess(msg -> {
                        span.end(msg);
                        enrichAgentSpan(span, msg);
                    })
                    .doOnError(t -> span.fail(t.getMessage()))
                    .doOnCancel(() -> span.fail("cancelled"))
                    .doFinally(sig -> reporter.report(span))
                    .contextWrite(childCtx.contextWriter());
        });
    }

    @Override
    public Flux<ChatResponse> callModel(
            ChatModelBase instance,
            List<Msg> inputMessages,
            List<ToolSchema> toolSchemas,
            GenerateOptions options,
            Supplier<Flux<ChatResponse>> modelCall) {
        return Flux.deferContextual(ctxView -> {
            O11yReactorContext o11yCtx = getOrCreateContext(ctxView);
            if (o11yCtx == null) {
                return modelCall.get();
            }

            O11ySpan span = startSpan(o11yCtx, instance.getModelName(), "LLM",
                    Map.of("tools", toolSchemas != null ? toolSchemas.size() : 0));
            span.withInput(inputMessages);

            O11yReactorContext childCtx = o11yCtx.pushSpan(span.getId());
            ChatResponseAggregator aggregator = new ChatResponseAggregator();

            return modelCall.get()
                    .doOnNext(aggregator::append)
                    .doOnError(t -> span.fail(t.getMessage()))
                    .doOnCancel(() -> span.fail("cancelled"))
                    .doFinally(sig -> {
                        ChatResponse response = aggregator.getResponse();
                        span.end(response);
                        if (response != null) {
                            enrichLlmSpan(span, response);
                        }
                        reporter.report(span);
                    })
                    .contextWrite(childCtx.contextWriter());
        });
    }

    @Override
    public Mono<ToolResultBlock> callTool(
            Toolkit instance,
            ToolCallParam toolCallParam,
            Supplier<Mono<ToolResultBlock>> toolKitCall) {
        return Mono.deferContextual(ctxView -> {
            O11yReactorContext o11yCtx = getOrCreateContext(ctxView);
            if (o11yCtx == null) {
                return toolKitCall.get();
            }

            String toolName = toolCallParam.getToolUseBlock() != null
                    ? toolCallParam.getToolUseBlock().getName()
                    : "unknown_tool";

            O11ySpan span = startSpan(o11yCtx, toolName, "TOOL",
                    Map.of("toolkit", instance.getClass().getSimpleName()));

            Map<String, Object> toolInput = toolCallParam.getInput();
            if ((toolInput == null || toolInput.isEmpty())
                    && toolCallParam.getToolUseBlock() != null
                    && toolCallParam.getToolUseBlock().getInput() != null) {
                toolInput = toolCallParam.getToolUseBlock().getInput();
            }

            span.withInput(toolInput != null ? toolInput : java.util.Collections.emptyMap());

            O11yReactorContext childCtx = o11yCtx.pushSpan(span.getId());

            return toolKitCall.get()
                    .flatMap(result -> {
                        if (isErrorResult(result)) {
                            span.fail(extractErrorText(result));
                        } else {
                            span.end(result);
                        }
                        return Mono.just(result);
                    })
                    .doOnError(t -> span.fail(t.getMessage()))
                    .doOnCancel(() -> span.fail("cancelled"))
                    .doFinally(sig -> reporter.report(span))
                    .contextWrite(childCtx.contextWriter());
        });
    }

    @Override
    public <TReq, TResp, TParams> List<TReq> callFormat(
            AbstractBaseFormatter<TReq, TResp, TParams> formatter,
            List<Msg> msgs,
            Supplier<List<TReq>> formatCall) {
        return formatCall.get();
    }

    @Override
    public <TResp> TResp runWithContext(ContextView reactorCtx, Supplier<TResp> inner) {
        O11yReactorContext o11yCtx = reactorCtx.getOrDefault(O11yReactorContext.KEY, null);
        if (o11yCtx == null) {
            return inner.get();
        }
        // Bridge Reactor Context → ThreadLocal for synchronous @Tool execution.
        // This is the only ThreadLocal usage in the SDK, strictly scoped to the
        // duration of the inner supplier.
        O11yToolContext.Context threadCtx = new O11yToolContext.Context(
                o11yCtx.getSessionId(), o11yCtx.getTraceId());
        threadCtx.setCurrentSpanId(o11yCtx.getCurrentSpanId());
        threadCtx.setTaskId(o11yCtx.getTaskId());
        O11yToolContext.set(threadCtx);
        MDC.put("sessionId", o11yCtx.getSessionId());
        MDC.put("traceId", o11yCtx.getTraceId());
        MDC.put("spanId", o11yCtx.getCurrentSpanId());
        if (o11yCtx.getTaskId() != null) {
            MDC.put("taskId", o11yCtx.getTaskId());
        }
        try {
            return inner.get();
        } finally {
            O11yToolContext.clear();
            MDC.remove("sessionId");
            MDC.remove("traceId");
            MDC.remove("spanId");
            MDC.remove("taskId");
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    /**
     * Read O11yReactorContext from Reactor ContextView.
     * Returns null when no context is available (caller skips tracing).
     */
    private O11yReactorContext getOrCreateContext(ContextView ctxView) {
        O11yReactorContext existing = ctxView.getOrDefault(O11yReactorContext.KEY, null);
        if (existing != null) {
            return existing;
        }
        return null; // No context → no tracing
    }

    private static void copyIfPresent(Map<String, Object> source, Map<String, Object> target, String key) {
        if (source.containsKey(key)) {
            target.put(key, source.get(key));
        }
    }

    private O11ySpan startSpan(
            O11yReactorContext ctx,
            String name,
            String spanType,
            Map<String, Object> extraMeta) {
        O11ySpan span = O11ySpan.start(ctx.getTraceId(), ctx.getSessionId(), name, spanType)
                .withParent(ctx.getCurrentSpanId())
                .withMetadata(extraMeta);
        return span;
    }

    private void enrichAgentSpan(O11ySpan span, Msg msg) {
        Map<String, Object> meta = new HashMap<>();
        if (msg.getMetadata() != null) {
            meta.putAll(msg.getMetadata());
        }
        meta.put("role", msg.getRole() != null ? msg.getRole().name() : null);
        meta.put("generateReason", msg.getGenerateReason() != null ? msg.getGenerateReason().name() : null);
        span.withMetadata(meta);
    }

    private void enrichLlmSpan(O11ySpan span, ChatResponse response) {
        // Merge into existing metadata rather than replacing, so initial fields (e.g. tools count) survive.
        Map<String, Object> meta = new HashMap<>();
        if (span.getMetadata() != null) {
            meta.putAll(span.getMetadata());
        }
        if (response.getUsage() != null) {
            ChatUsage usage = response.getUsage();
            meta.put("prompt_tokens", usage.getInputTokens());
            meta.put("completion_tokens", usage.getOutputTokens());
            meta.put("total_tokens", usage.getTotalTokens());
            meta.put("time_seconds", usage.getTime());
        }
        if (response.getFinishReason() != null) {
            meta.put("finish_reason", response.getFinishReason());
        }
        if (response.getMetadata() != null) {
            meta.putAll(response.getMetadata());
        }
        span.withMetadata(meta);
    }

    private String determineAgentSpanType(String agentId) {
        if (agentId == null) {
            return "AGENT_CHAIN";
        }
        String lowerAgentId = agentId.toLowerCase();
        if (lowerAgentId.contains("director")) {
            return "DIRECTOR";
        }
        if (lowerAgentId.matches(".*(system|combat|numerical|gameplay|executive|qa).*")) {
            return "SUB_AGENT";
        }
        return "AGENT_CHAIN";
    }

    private static String tryGetPromptVersion(AgentBase instance) {
        try {
            java.lang.reflect.Method m = instance.getClass().getMethod("getPromptVersion");
            Object result = m.invoke(instance);
            return result != null ? result.toString() : null;
        } catch (NoSuchMethodException e) {
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean isErrorResult(ToolResultBlock result) {
        if (result == null || result.getOutput() == null) {
            return false;
        }
        return result.getOutput().stream()
                .filter(b -> b instanceof TextBlock)
                .map(b -> ((TextBlock) b).getText())
                .anyMatch(text -> text.startsWith("Error: ") || text.startsWith("[ERROR]"));
    }

    private static String extractErrorText(ToolResultBlock result) {
        return result.getOutput().stream()
                .filter(b -> b instanceof TextBlock)
                .map(b -> ((TextBlock) b).getText())
                .findFirst()
                .orElse("(unknown error)");
    }

    private static class ChatResponseAggregator {
        private final StringBuilder textBuilder = new StringBuilder();
        private ChatUsage usage;
        private String finishReason;
        private final Map<String, Object> metadata = new HashMap<>();

        void append(ChatResponse chunk) {
            if (chunk.getContent() != null) {
                chunk.getContent().forEach(block -> {
                    if (block instanceof TextBlock tb) {
                        textBuilder.append(tb.getText());
                    }
                });
            }
            if (chunk.getUsage() != null) {
                usage = chunk.getUsage();
            }
            if (chunk.getFinishReason() != null) {
                finishReason = chunk.getFinishReason();
            }
            if (chunk.getMetadata() != null) {
                metadata.putAll(chunk.getMetadata());
            }
        }

        ChatResponse getResponse() {
            if (textBuilder.isEmpty() && usage == null && finishReason == null) {
                return null;
            }
            TextBlock textBlock = TextBlock.builder()
                    .text(textBuilder.toString())
                    .build();
            ChatResponse.Builder builder = ChatResponse.builder()
                    .content(List.of(textBlock))
                    .metadata(metadata);
            if (usage != null) {
                builder.usage(usage);
            }
            if (finishReason != null) {
                builder.finishReason(finishReason);
            }
            return builder.build();
        }
    }
}
