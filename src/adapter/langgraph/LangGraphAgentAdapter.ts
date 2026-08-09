import { StateGraph, Annotation, START, END, type MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { BaseMessage, AIMessage as AIMessageType } from "@langchain/core/messages";
import { SystemMessage, HumanMessage, AIMessage, AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import type { AgentPort, AgentProcessOptions } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { AgentResponse } from "../../port/agent/AgentResponse.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { MemoryPort } from "../../port/memory/MemoryPort.js";
import { HookContext } from "../../port/hook/HookContext.js";
import { classifyModelError } from "../../core/model/classifyModelError.js";
import { hashString, normalizeToolArgs, stableStringify } from "../../core/guard/hash.js";
import { LangGraphMessageMapper } from "./LangGraphMessageMapper.js";
import { LangGraphToolAdapter } from "./LangGraphToolAdapter.js";
import { sanitizeToolSequence } from "./sanitizeMessages.js";
import type { LangGraphModelAdapter } from "./LangGraphModelAdapter.js";
import { isToolFastFailError } from "../../core/tool/ToolFastFailError.js";
import { isToolHitlRequiredError } from "../../core/tool/ToolHitlRequiredError.js";
import { SagaCoordinator } from "../../core/saga/SagaCoordinator.js";
import type { CompensateFailureQueuePort } from "../../port/saga/CompensateFailureQueuePort.js";

export interface LangGraphSagaOptions {
  readonly enabled: boolean;
  readonly failureQueue?: CompensateFailureQueuePort;
}

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  sessionId: Annotation<string>({ value: (_x, y) => y }),
  iteration: Annotation<number>({ value: (_x, y) => y, default: () => 0 }),
});

/**
 * LLM providers (Anthropic/OpenAI) only permit system messages as the first
 * message. Conversation history can legitimately contain system messages —
 * context archives produced by ContextManager and long-term memory injected
 * by MemoryInjectionHook — which would otherwise end up in non-leading
 * positions and be rejected by the provider. Demote them to HumanMessage so
 * their content is preserved without violating the provider constraint.
 */
function demoteNonLeadingSystemMessages(msgs: BaseMessage[]): BaseMessage[] {
  return msgs.map((m) =>
    m instanceof SystemMessage ? new HumanMessage({ content: m.content }) : m,
  );
}

/**
 * 重复调用守卫（循环防护）：
 * - 签名 = toolName + 规范化参数（数字字符串折叠为数字，键排序），
 *   模型交替 `"40"`/`40` 无法绕过（评测 EV-021 实证原 hash 被躲过）；
 * - 同一签名在历史中已出现 >= REPEAT_CANCEL_THRESHOLD 次 → 取消执行并提示。
 */
export const REPEAT_CANCEL_THRESHOLD = 2;

export function toolCallSignature(toolName: string, args?: Record<string, unknown>): string {
  return hashString(`${toolName}:${stableStringify(normalizeToolArgs(args ?? {}))}`);
}

/** 统计历史消息中同一签名工具调用的出现次数（含未执行被取消的调用，保守计数）。 */
export function countToolCallOccurrences(messages: BaseMessage[], signature: string): number {
  let count = 0;
  for (const m of messages) {
    if (m instanceof AIMessage) {
      for (const tc of (m as AIMessage).tool_calls ?? []) {
        if (toolCallSignature(tc.name, tc.args as Record<string, unknown>) === signature) {
          count += 1;
        }
      }
    }
  }
  return count;
}

/** 收集历史中重复执行 >=2 次的 (toolName, count) 列表，用于注入提示。 */
export function collectRepeatedToolCalls(messages: BaseMessage[]): Array<[string, number]> {
  const counts = new Map<string, { name: string; count: number }>();
  for (const m of messages) {
    if (!(m instanceof AIMessage)) continue;
    for (const tc of (m as AIMessage).tool_calls ?? []) {
      const sig = toolCallSignature(tc.name, tc.args as Record<string, unknown>);
      const entry = counts.get(sig);
      if (entry) {
        entry.count += 1;
      } else {
        counts.set(sig, { name: tc.name, count: 1 });
      }
    }
  }
  return Array.from(counts.values())
    .filter((e) => e.count >= 2)
    .map((e) => [e.name, e.count] as [string, number]);
}

/** 工具结果截断：超长 ToolMessage 内容只保留前缀并标注原长（模型上下文预算兜底）。 */
export function truncateToolResult(content: string, limit: number): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}...[已截断 原长 ${content.length} 字符]`;
}

export class LangGraphAgentAdapter implements AgentPort {
  private descriptor: AgentDescriptor;
  private compiledGraph: unknown;
  private messageMapper = new LangGraphMessageMapper();
  private sagaRef = { coordinator: null as SagaCoordinator | null };
  private toolAdapter: LangGraphToolAdapter;
  private memory: MemoryPort | undefined;
  private currentProcessOptions: AgentProcessOptions | undefined;

  constructor(
    descriptor: AgentDescriptor,
    tools: ToolPort[],
    private modelAdapter: LangGraphModelAdapter,
    private hooks: AgentHook[],
    private checkpointer?: MemorySaver,
    private sagaOptions: LangGraphSagaOptions = { enabled: true },
    memory?: MemoryPort,
  ) {
    this.descriptor = descriptor;
    this.memory = memory;
    this.toolAdapter = new LangGraphToolAdapter({ sagaRef: this.sagaRef });
    this.compiledGraph = this.buildGraph(tools);
  }

  /** Re-bind short-term memory for a cached agent instance. */
  setMemory(memory: MemoryPort | undefined): void {
    this.memory = memory;
  }

  getMemory(): MemoryPort | undefined {
    return this.memory;
  }

  /** Replace hooks (e.g. ContextManagementHook.withMemory) on a cached instance. */
  setHooks(hooks: AgentHook[]): void {
    this.hooks = hooks;
  }

  getHooks(): readonly AgentHook[] {
    return this.hooks;
  }

  /**
   * Aggregate an Anthropic/OpenAI streaming response into a single AIMessage.
   *
   * AIMessageChunk.concat() simply concatenates content arrays, which breaks
   * Anthropic's block-level streaming (each chunk carries a partial block with
   * the same id, producing many duplicate blocks). This helper merges content
   * blocks by their `id`, concatenates partial tool_call_chunks into proper
   * tool_calls, and keeps response_metadata from the last chunk.
   */
  private resolveOnTextDelta(): ((delta: string) => void | Promise<void>) | undefined {
    if (this.currentProcessOptions?.streamingEnabled === false) {
      return undefined;
    }
    return this.currentProcessOptions?.onTextDelta;
  }

  private async aggregateStream(
    chunks: AsyncIterable<AIMessageChunk>,
    onTextDelta?: (delta: string) => void | Promise<void>,
  ): Promise<AIMessage> {
    const contentBlocks = new Map<string, Record<string, unknown>>();
    let textContent = "";
    let hasArrayContent = false;
    const toolCallMap = new Map<string, { id: string; name: string; args: string }>();
    let lastMetadata: Record<string, unknown> = {};
    let lastAdditionalKwargs: Record<string, unknown> = {};
    let usageInput = 0;
    let usageOutput = 0;
    // reasoning_content 按分片流式到达，必须累积拼接（spread 只会保留最后一片）
    let reasoningText = "";

    for await (const chunk of chunks) {
      const content = chunk.content;

      if (typeof content === "string") {
        if (content && onTextDelta) {
          await onTextDelta(content);
        }
        textContent += content;
      } else if (Array.isArray(content)) {
        hasArrayContent = true;
        for (const block of content) {
          if (typeof block !== "object" || block === null) continue;
          const b = block as Record<string, unknown>;
          const id = (b.id as string) ?? `_idx_${contentBlocks.size}`;

          if (contentBlocks.has(id)) {
            const existing = contentBlocks.get(id)!;
            if (typeof existing.text === "string" && typeof b.text === "string") {
              if (b.text && onTextDelta) {
                await onTextDelta(b.text);
              }
              existing.text += b.text;
            }
            if (typeof existing.partial_json === "string" && typeof b.partial_json === "string") {
              existing.partial_json += b.partial_json;
            }
          } else {
            if (typeof b.text === "string" && b.text && onTextDelta) {
              await onTextDelta(b.text);
            }
            contentBlocks.set(id, { ...b });
          }
        }
      }

      // Aggregate partial tool call chunks.
      // Use `index` as the grouping key because only the first chunk carries
      // the real id/name — subsequent chunks have empty strings for those
      // fields but share the same index. Using `id` directly would create
      // separate entries ("" is not nullish for `??`), losing the args.
      const tcChunks = (chunk as unknown as { tool_call_chunks?: Array<{ id?: string; name?: string; args?: string; index?: number }> }).tool_call_chunks;
      if (tcChunks) {
        for (const tc of tcChunks) {
          const key = `tc_${tc.index ?? toolCallMap.size}`;
          if (toolCallMap.has(key)) {
            const existing = toolCallMap.get(key)!;
            if (tc.args) existing.args += tc.args;
            if (tc.name && !existing.name) existing.name = tc.name;
            if (tc.id && !existing.id) existing.id = tc.id;
          } else {
            toolCallMap.set(key, { id: tc.id ?? "", name: tc.name ?? "", args: tc.args ?? "" });
          }
        }
      }

      if (chunk.response_metadata) {
        lastMetadata = { ...lastMetadata, ...(chunk.response_metadata as Record<string, unknown>) };
      }
      if (chunk.additional_kwargs) {
        const reasoning = (chunk.additional_kwargs as Record<string, unknown>).reasoning_content;
        if (typeof reasoning === "string" && reasoning.length > 0) {
          reasoningText += reasoning;
        }
        lastAdditionalKwargs = { ...lastAdditionalKwargs, ...chunk.additional_kwargs };
      }
      if (chunk.usage_metadata?.input_tokens) usageInput = chunk.usage_metadata.input_tokens;
      if (chunk.usage_metadata?.output_tokens) usageOutput = chunk.usage_metadata.output_tokens;
    }

    // 用累积值覆盖（分片场景下 spread 合并后的最后一片不完整）
    if (reasoningText) {
      lastAdditionalKwargs = { ...lastAdditionalKwargs, reasoning_content: reasoningText };
    }

    // Build final tool_calls
    const toolCalls = Array.from(toolCallMap.values())
      .filter((tc) => tc.name)
      .map((tc) => {
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(tc.args || "{}"); } catch { /* keep empty */ }
        return { id: tc.id, name: tc.name, args: parsedArgs };
      });

    // Use array blocks if present, otherwise the concatenated string.
    // Cast needed because Anthropic content blocks are runtime objects, not
    // the narrower TypeScript types expected by AIMessage's constructor.
    const msgContent = hasArrayContent
      ? (Array.from(contentBlocks.values()) as unknown as string)
      : textContent;

    return new AIMessage({
      content: msgContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      response_metadata: lastMetadata,
      additional_kwargs: lastAdditionalKwargs,
      usage_metadata: {
        input_tokens: usageInput,
        output_tokens: usageOutput,
        total_tokens: usageInput + usageOutput,
      },
    });
  }

  private async runHooks(point: import("../../port/hook/HookPoint.js").HookPoint, context: import("../../port/hook/HookContext.js").HookContext): Promise<import("../../port/hook/HookContext.js").HookContext> {
    let ctx = context;
    const sortedHooks = [...this.hooks].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    for (const hook of sortedHooks) {
      try {
        ctx = await hook.onEvent(point, ctx);
        if (ctx.abort) break;
      } catch (err) {
        console.error(`[Hook] Error in ${hook.constructor.name} at ${point}:`, err);
      }
    }
    return ctx;
  }

  private beginSaga(sessionId: string): void {
    this.sagaRef.coordinator = new SagaCoordinator({
      enabled: this.sagaOptions.enabled,
      sessionId,
      agentName: this.descriptor.name,
      failureQueue: this.sagaOptions.failureQueue,
    });
  }

  private commitSaga(): void {
    this.sagaRef.coordinator?.clear();
    this.sagaRef.coordinator = null;
  }

  private async rollbackSaga(reason: string): Promise<void> {
    const coordinator = this.sagaRef.coordinator;
    if (!coordinator) return;
    await coordinator.compensateAll(reason);
    this.sagaRef.coordinator = null;
  }

  private buildGraph(tools: ToolPort[]) {
    const lgTools = this.toolAdapter.toLangGraphTools(tools);
    if (process.env.EVAL_DEBUG === "1") {
      console.log("[lgTools]", JSON.stringify(lgTools.map((t) => ({ name: t.name, schema: t.schema ?? null }))).slice(0, 400));
    }
    const descriptor = this.descriptor;
    const runHooks = this.runHooks.bind(this);
    const modelAdapter = this.modelAdapter;
    const aggregateStream = this.aggregateStream.bind(this);

    const invokeLlm = async (
      msgs: BaseMessage[],
      streamOptions: Record<string, unknown>,
    ): Promise<AIMessage> => {
      const bound = (modelAdapter.getLangChainModel() as unknown as {
        bindTools(tools: unknown[]): {
          stream(
            msgs: BaseMessage[],
            options?: Record<string, unknown>,
          ): AsyncIterable<AIMessageChunk> | Promise<AsyncIterable<AIMessageChunk>>;
        };
      }).bindTools(lgTools);
      const stream = await bound.stream(msgs, streamOptions);
      const aggregated = await aggregateStream(stream, this.resolveOnTextDelta());
      // An empty completion is a failure (retriable), never a silent success:
      // reasoning models can exhaust the output budget on reasoning_content
      // and return finish_reason=length with zero visible content.
      const hasText =
        typeof aggregated.content === "string"
          ? aggregated.content.length > 0
          : JSON.stringify(aggregated.content).length > 2;
      const hasToolCalls = (aggregated.tool_calls?.length ?? 0) > 0;
      if (!hasText && !hasToolCalls) {
        throw new Error("LLM returned an empty response");
      }
      return aggregated;
    };

    const llmCall = async (state: typeof AgentState.State, config?: { signal?: AbortSignal }) => {
      // Early abort check — must propagate, not swallow
      if (config?.signal?.aborted) {
        console.log(`[LangGraphAgentAdapter:${descriptor.name}] Aborted before LLM call`);
        throw new DOMException("Execution cancelled", "AbortError");
      }

      const hookCtx = HookContext.create({
        agentName: descriptor.name,
        sessionId: state.sessionId,
        iteration: state.iteration,
        maxIterations: descriptor.maxIterations,
        modelName: modelAdapter.getActiveModelName(),
        messages: state.messages.map((m) => this.messageMapper.fromLangGraph(m)),
        metadata: { abortSignal: config?.signal },
      });
      const preCtx = await runHooks("pre_reasoning", hookCtx);
      if (preCtx.abort) {
        const reason = preCtx.abortReason ?? "Aborted by pre_reasoning hook";
        console.warn(`[LangGraphAgentAdapter:${descriptor.name}] ${reason}`);
        if (reason === "CANCELLED") {
          throw new DOMException("Execution cancelled", "AbortError");
        }
        throw new Error(reason);
      }

      try {
        // Prefer hook-modified messages; keep MemoryPort archive in sync.
        let chatMessages = preCtx.messages
          ?? state.messages.map((m) => this.messageMapper.fromLangGraph(m));
        if (this.memory) {
          chatMessages = await this.memory.maybeCompress(chatMessages);
        }
        const effectiveMessages = chatMessages.map((m) => this.messageMapper.toLangGraph(m));

        const systemMsg = new SystemMessage({ content: descriptor.systemPrompt });

        // Inline iteration-budget injection (remaining iterations <= 3).
        // Use HumanMessage instead of SystemMessage because Anthropic only
        // allows system messages as the first message in the conversation.
        const remaining = descriptor.maxIterations - state.iteration;
        const injectedMessages = demoteNonLeadingSystemMessages(effectiveMessages);
        if (remaining === 1) {
          injectedMessages.push(
            new HumanMessage({ content: "【系统提示】这是最后一次推理机会。你必须立即输出完整的文本结果，禁止发起任何工具调用。" })
          );
        } else if (remaining <= 3 && remaining > 0) {
          injectedMessages.push(
            new HumanMessage({ content: `【系统提示】剩余推理次数: ${remaining}。请尽快总结并输出最终设计内容，不要再调用工具。` })
          );
        }

        // 重复调用守卫：历史中同一 (tool, 规范化参数) 已执行 >=2 次 → 提示模型
        // 停止重复（评测 EV-021：模型对同一表连续 5 次重复查询烧穿 500k token 预算）。
        const repeated = collectRepeatedToolCalls(injectedMessages);
        if (repeated.length > 0) {
          const summary = repeated.map(([name, n]) => `${name}(${n} 次)`).join("、");
          injectedMessages.push(
            new HumanMessage({
              content: `【系统提示】你已用相同参数重复调用工具：${summary}。重复调用不会得到新结果。请立即停止重复调用，直接基于已有信息输出最终答案，或换一种完全不同的查询方式。`,
            })
          );
        }

        // 消息序列合法性兜底：压缩/归档可能产生"悬空 tool 消息"（无前置
        // assistant tool_calls），OpenAI 系 provider 会 400 拒绝（评测 EV-058
        // 实证）。降级为文本而非整题失败。
        const sanitizedMessages = sanitizeToolSequence(injectedMessages);

        console.log(`[LangGraphAgentAdapter:${descriptor.name}] LLM invoke (streaming) with maxTokens=${descriptor.maxTokens ?? "undefined"} model=${modelAdapter.getActiveModelName()}`);
        // Use streaming internally to avoid Anthropic SDK's 10-minute timeout
        // for non-streaming requests with high max_tokens.
        const streamOptions: Record<string, unknown> = descriptor.maxTokens ? { maxTokens: descriptor.maxTokens } : {};
        if (config?.signal) {
          streamOptions.signal = config.signal;
        }

        // LLM 调用重试：优先走 fallback 链（promoteFallback）；无备用模型但
        // 错误可重试（流中断/超时等瞬时故障）时同模型退避重试一次。
        const maxLlmAttempts = 2;
        let response: AIMessage;
        for (let attempt = 1; ; attempt += 1) {
          try {
            response = await invokeLlm([systemMsg, ...sanitizedMessages], streamOptions);
            modelAdapter.recordSuccess();
            break;
          } catch (err) {
            if (config?.signal?.aborted) throw err;
            if (modelAdapter.promoteFallback(err)) {
              console.warn(
                `[LangGraphAgentAdapter:${descriptor.name}] Retrying LLM with fallback model=${modelAdapter.getActiveModelName()}`,
              );
              continue;
            }
            if (classifyModelError(err) === "retriable" && attempt < maxLlmAttempts) {
              const backoffMs = 1500 * attempt;
              console.warn(
                `[LangGraphAgentAdapter:${descriptor.name}] Retriable LLM error (${err instanceof Error ? err.message : String(err)}), same-model retry ${attempt}/${maxLlmAttempts - 1} after ${backoffMs}ms`,
              );
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            throw err;
          }
        }

        const metadata = response.response_metadata as Record<string, unknown> | undefined;
        const finishReason = (metadata?.finish_reason ?? metadata?.stop_reason) as string | undefined;
        console.log(`[LangGraphAgentAdapter:${descriptor.name}] LLM response finish_reason=${finishReason ?? "unknown"}, contentLength=${typeof response.content === "string" ? response.content.length : JSON.stringify(response.content).length}`);

        // 观测：LLM 思考（reasoning_content 累积）与可见输出预览，随 post_reasoning span 落库
        const rawAdditional = response.additional_kwargs as Record<string, unknown> | undefined;
        const llmReasoning = typeof rawAdditional?.reasoning_content === "string"
          ? (rawAdditional.reasoning_content as string)
          : undefined;
        const llmOutput = typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

        const postCtx = await runHooks("post_reasoning", HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          iteration: state.iteration,
          modelName: modelAdapter.getActiveModelName(),
          messages: [...(preCtx.messages ?? []), this.messageMapper.fromLangGraph(response)],
          inputTokenCount: response.usage_metadata?.input_tokens ?? 0,
          outputTokenCount: response.usage_metadata?.output_tokens ?? 0,
          llmReasoning,
          llmOutput,
        }));
        if (postCtx.abort) {
          const reason = postCtx.abortReason ?? "Aborted by post_reasoning hook";
          console.warn(`[LangGraphAgentAdapter:${descriptor.name}] ${reason}`);
          throw new Error(reason);
        }

        return { messages: [response], iteration: state.iteration + 1 };
      } catch (err) {
        // Handle abort gracefully
        const isAbort = err instanceof Error && (
          err.name === "AbortError" ||
          err.message.includes("abort") ||
          err.message.includes("Abort") ||
          config?.signal?.aborted
        );
        if (isAbort) {
          console.log(`[LangGraphAgentAdapter:${descriptor.name}] LLM call aborted by signal`);
          throw err instanceof Error ? err : new DOMException("Execution cancelled", "AbortError");
        }

        const error = err instanceof Error ? err : new Error(String(err));
        // Log detailed error for API debugging
        console.error(`[LangGraphAgentAdapter:${descriptor.name}] LLM invoke failed:`, error.message);
        if ((err as Record<string, unknown>)?.response) {
          console.error(`[LangGraphAgentAdapter:${descriptor.name}] API response:`, JSON.stringify((err as Record<string, unknown>).response));
        }
        if ((err as Record<string, unknown>)?.body) {
          console.error(`[LangGraphAgentAdapter:${descriptor.name}] API body:`, JSON.stringify((err as Record<string, unknown>).body));
        }
        await runHooks("on_error", HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          error,
        }));
        throw err;
      }
    };

    const toolNode = new ToolNode(lgTools);
    const wrappedToolNode = async (state: typeof AgentState.State, config?: { signal?: AbortSignal }) => {
      if (config?.signal?.aborted) {
        await this.rollbackSaga("aborted_before_tools");
        throw new DOMException("Execution cancelled", "AbortError");
      }

      const lastMessage = state.messages.at(-1) as AIMessageType | undefined;
      const toolCalls = lastMessage?.tool_calls ?? [];

      // 重复调用守卫：同一 (tool, 规范化参数) 历史中已执行 >=2 次 → 本次取消执行，
      // 用取消说明代替真实结果，防止模型空转烧 token（评测 6 题 token 风暴根因）。
      const priorMessages = state.messages.slice(0, -1);
      const callIdOf = (tc: { id?: string }): string => tc.id ?? "";
      const cancelledById = new Set<string>();
      for (const tc of toolCalls) {
        const sig = toolCallSignature(tc.name, tc.args as Record<string, unknown>);
        const prior = countToolCallOccurrences(priorMessages, sig);
        if (prior >= REPEAT_CANCEL_THRESHOLD) {
          cancelledById.add(callIdOf(tc));
          console.warn(
            `[LangGraphAgentAdapter:${descriptor.name}] Repeat tool call cancelled: ${tc.name} prior=${prior} hash=${sig}`,
          );
        }
      }
      const executeCalls = toolCalls.filter((tc) => !cancelledById.has(callIdOf(tc)));
      const cancelledMessages: BaseMessage[] = toolCalls
        .filter((tc) => cancelledById.has(callIdOf(tc)))
        .map((tc) => new ToolMessage({
          content: `【系统】该调用 (${tc.name}) 与历史完全相同（已执行过），已由重复调用守卫取消。请基于已有信息直接作答，或换一种完全不同的查询方式。`,
          tool_call_id: callIdOf(tc),
          name: tc.name,
        }));

      for (const tc of executeCalls) {
        const preCtx = HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          toolName: tc.name,
          toolArguments: tc.args as Record<string, unknown>,
          metadata: { abortSignal: config?.signal },
        });
        const afterPre = await runHooks("pre_tool_execution", preCtx);
        if (afterPre.abort) {
          const reason = afterPre.abortReason ?? `Tool execution aborted: ${tc.name}`;
          console.warn(`[LangGraphAgentAdapter:${descriptor.name}] ${reason}`);
          await this.rollbackSaga(reason);
          throw reason === "CANCELLED"
            ? new DOMException("Execution cancelled", "AbortError")
            : new Error(reason);
        }
      }

      let result: { messages: BaseMessage[] };
      try {
        if (executeCalls.length === 0) {
          result = { messages: cancelledMessages };
        } else {
          // 只执行未被取消的调用：用过滤后的 lastMessage 调用 ToolNode。
          const filteredLast = new AIMessage({
            content: lastMessage?.content ?? "",
            tool_calls: executeCalls,
            additional_kwargs: lastMessage?.additional_kwargs ?? {},
          });
          const nodeResult = await toolNode.invoke({
            ...state,
            messages: [...state.messages.slice(0, -1), filteredLast],
          });
          result = {
            messages: [...nodeResult.messages, ...cancelledMessages],
          };
        }
      } catch (err) {
        if (isToolFastFailError(err)) {
          console.warn(`[LangGraphAgentAdapter:${descriptor.name}] ${err.message}`);
          await this.rollbackSaga(`tool_fast_fail:${err.toolName}`);
          throw err;
        }
        if (isToolHitlRequiredError(err)) {
          console.warn(`[LangGraphAgentAdapter:${descriptor.name}] ${err.message}`);
          throw err;
        }
        await this.rollbackSaga(err instanceof Error ? err.message : String(err));
        throw err;
      }

      // 模型上下文预算兜底：超长工具结果截断（knowledge-hub 精简后少触发）。
      const truncateLimit = this.descriptor.toolResultMaxChars ?? 0;
      if (truncateLimit > 0) {
        result.messages = result.messages.map((m) =>
          m instanceof ToolMessage && typeof m.content === "string"
            ? new ToolMessage({
                content: truncateToolResult(m.content, truncateLimit),
                tool_call_id: m.tool_call_id,
                name: m.name,
              })
            : m,
        );
      }

      for (const tc of executeCalls) {
        const metadata = this.toolAdapter.lastToolMetadata.get(tc.name) || {};
        const postCtx = HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          toolName: tc.name,
          toolResult: JSON.stringify(result.messages.at(-1)?.content ?? ""),
          metadata: { abortSignal: config?.signal, toolResultMetadata: metadata },
        });
        const afterPost = await runHooks("post_tool_execution", postCtx);
        if (afterPost.abort) {
          const reason = afterPost.abortReason ?? "Aborted after tool execution";
          await this.rollbackSaga(reason);
          throw reason === "CANCELLED"
            ? new DOMException("Execution cancelled", "AbortError")
            : new Error(reason);
        }
      }

      if (config?.signal?.aborted) {
        await this.rollbackSaga("aborted_after_tools");
        throw new DOMException("Execution cancelled", "AbortError");
      }

      return result;
    };

    const forceFinalOutput = async (state: typeof AgentState.State, config?: { signal?: AbortSignal }) => {
      console.warn(`[LangGraphAgentAdapter:${descriptor.name}] Iteration budget exhausted with pending tool calls. Forcing final text output.`);
      const rawModel = modelAdapter.getLangChainModel();
      const systemMsg = new SystemMessage({ content: descriptor.systemPrompt });
      // Use HumanMessage for the final instruction because Anthropic only
      // allows system messages as the first message in the conversation.
      const finalInstruction = new HumanMessage({
        content: "【系统提示】迭代预算已耗尽，之前规划但尚未执行的工具调用已被取消。请基于你当前已掌握的所有信息，直接输出完整、连贯的最终设计文档。禁止再发起任何工具调用。",
      });
      const streamOptions: Record<string, unknown> = {};
      if (config?.signal) {
        streamOptions.signal = config.signal;
      }
      const response = await this.aggregateStream(
        await rawModel.stream(
          sanitizeToolSequence([
            systemMsg,
            ...demoteNonLeadingSystemMessages(state.messages),
            finalInstruction,
          ]),
          streamOptions,
        ),
        this.resolveOnTextDelta(),
      );
      return { messages: [response], iteration: state.iteration };
    };

    const shouldContinue = (state: typeof AgentState.State) => {
      const lastMessage = state.messages.at(-1) as AIMessageType | undefined;
      if (state.iteration >= descriptor.maxIterations) {
        runHooks("on_iteration_budget", HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          iteration: state.iteration,
          maxIterations: descriptor.maxIterations,
        })).catch(() => {});
        if (lastMessage?.tool_calls?.length) {
          return "forceFinalOutput";
        }
        return END;
      }
      if (lastMessage?.tool_calls?.length) {
        return "tools";
      }
      return END;
    };

    const builder = new StateGraph(AgentState)
      .addNode("llmCall", llmCall)
      .addNode("tools", wrappedToolNode)
      .addNode("forceFinalOutput", forceFinalOutput)
      .addEdge(START, "llmCall")
      .addConditionalEdges("llmCall", shouldContinue, ["tools", "forceFinalOutput", END])
      .addEdge("tools", "llmCall")
      .addEdge("forceFinalOutput", END);

    return builder.compile({ checkpointer: this.checkpointer });
  }

  async process(sessionId: string, messages: ChatMessage[], options?: AgentProcessOptions): Promise<AgentResponse> {
    this.currentProcessOptions = options;
    try {
      // Early abort check
      if (options?.signal?.aborted) {
        return {
          agentName: this.descriptor.name,
          message: null,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted before execution",
        };
      }

      const preCtx = await this.runHooks("pre_agent_call", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        messages,
      }));
      if (preCtx.abort) {
        return {
          agentName: this.descriptor.name,
          message: null,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted by hook",
        };
      }

      this.beginSaga(sessionId);

      if (this.memory) {
        for (const m of messages) {
          this.memory.addMessage(m);
        }
      }
      let startMessages = preCtx.messages ?? messages;
      if (this.memory) {
        startMessages = await this.memory.maybeCompress(startMessages);
      }

      const lgMessages = this.messageMapper.toLangGraphList(startMessages);
      const recursionLimit = this.descriptor.maxIterations * 2 + 4;
      const config: Record<string, unknown> = {
        configurable: { thread_id: sessionId },
        recursionLimit,
      };
      if (options?.signal) {
        config.signal = options.signal;
      }

      const compiled = this.compiledGraph as { invoke(state: unknown, config: unknown): Promise<{ messages: BaseMessage[] }> };
      const result = await compiled.invoke(
        { messages: lgMessages, sessionId, iteration: 0 },
        config
      );

      // Prefer the last AIMessage as the response (not ToolMessage or HumanMessage)
      let lastMessage: BaseMessage | undefined;
      for (let i = result.messages.length - 1; i >= 0; i--) {
        if (result.messages[i] instanceof AIMessage) {
          lastMessage = result.messages[i];
          break;
        }
      }
      if (!lastMessage && result.messages.length > 0) {
        lastMessage = result.messages.at(-1);
      }

      const finalMetadata = (lastMessage as { response_metadata?: Record<string, unknown> }).response_metadata;
      const finalFinishReason = (finalMetadata?.finish_reason ?? finalMetadata?.stop_reason) as string | undefined;
      console.log(`[LangGraphAgentAdapter:${this.descriptor.name}] Final finish_reason=${finalFinishReason ?? "unknown"}`);

      let responseMessage = lastMessage
        ? this.messageMapper.fromLangGraph(lastMessage)
        : null;

      // Fallback: if the AI message has no text but has tool calls (e.g. iteration budget exhausted),
      // serialize the tool calls as readable text so the user sees what the agent intended to do.
      if (responseMessage && !ChatMessage.textContent(responseMessage)?.trim()) {
        const toolCalls = ChatMessage.toolCalls(responseMessage);
        if (toolCalls.length > 0) {
          const fallback = toolCalls.map(tc =>
            `【待执行工具】${tc.toolName}\n参数：${JSON.stringify(tc.arguments, null, 2)}`
          ).join("\n\n");
          responseMessage = {
            ...responseMessage,
            content: [{ type: "text", text: fallback }, ...responseMessage.content],
          };
        }
      }

      const postCtx = await this.runHooks("post_agent_call", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        messages: responseMessage ? [...(preCtx.messages ?? []), responseMessage] : (preCtx.messages ?? []),
      }));

      await this.runHooks("pre_summary", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        messages: postCtx.messages,
      }));

      await this.runHooks("post_summary", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        messages: postCtx.messages,
      }));

      if (options?.signal?.aborted) {
        console.log(`[LangGraphAgentAdapter:${this.descriptor.name}] Process completed but signal aborted`);
        await this.rollbackSaga("cancelled");
        return {
          agentName: this.descriptor.name,
          message: responseMessage,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted by user",
        };
      }

      this.commitSaga();

      return {
        agentName: this.descriptor.name,
        message: responseMessage,
        metadata: {},
        success: true,
        errorMessage: null,
      };
    } catch (err) {
      // Handle abort gracefully
      const isAbort = err instanceof Error && (
        err.name === "AbortError" ||
        err.message.includes("abort") ||
        err.message.includes("Abort")
      ) || options?.signal?.aborted;
      if (isAbort) {
        console.log(`[LangGraphAgentAdapter:${this.descriptor.name}] Process aborted by signal`);
        await this.rollbackSaga("aborted");
        return {
          agentName: this.descriptor.name,
          message: null,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted by user",
        };
      }

      if (isToolHitlRequiredError(err)) {
        this.commitSaga();
        throw err;
      }

      if (isToolFastFailError(err)) {
        await this.rollbackSaga(`fast_fail:${err.toolName}`);
      } else {
        await this.rollbackSaga(err instanceof Error ? err.message : String(err));
      }

      await this.runHooks("on_error", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        error: err instanceof Error ? err : new Error(String(err)),
      }));
      return {
        agentName: this.descriptor.name,
        message: null,
        metadata: {},
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.currentProcessOptions = undefined;
    }
  }

  async *processStream(sessionId: string, messages: ChatMessage[], options?: AgentProcessOptions): AsyncIterable<AgentResponse> {
    this.currentProcessOptions = options;
    try {
    // Early abort check
    if (options?.signal?.aborted) {
      yield {
        agentName: this.descriptor.name,
        message: null,
        metadata: { aborted: true },
        success: false,
        errorMessage: "Aborted before execution",
      };
      return;
    }

    const preCtx = await this.runHooks("pre_agent_call", HookContext.create({
      agentName: this.descriptor.name,
      sessionId,
      messages,
    }));
    if (preCtx.abort) {
      yield {
        agentName: this.descriptor.name,
        message: null,
        metadata: { aborted: true },
        success: false,
        errorMessage: "Aborted by hook",
      };
      return;
    }

    this.beginSaga(sessionId);

    const lgMessages = this.messageMapper.toLangGraphList(messages);
    const recursionLimit = this.descriptor.maxIterations * 2 + 4;
    const config: Record<string, unknown> = {
      configurable: { thread_id: sessionId },
      streamMode: "updates" as const,
      recursionLimit,
    };
    if (options?.signal) {
      config.signal = options.signal;
    }

    const compiled = this.compiledGraph as {
      stream(state: unknown, config: unknown): Promise<AsyncIterable<Record<string, { messages?: BaseMessage[] }>>>;
    };

    try {
      const stream = await compiled.stream(
        { messages: lgMessages, sessionId, iteration: 0 },
        config
      );
      let yielded = false;
      let lastLlmMessage: BaseMessage | null = null;

      let abortedMidStream = false;
      for await (const chunk of stream) {
        // Check abort between chunks
        if (options?.signal?.aborted) {
          console.log(`[LangGraphAgentAdapter:${this.descriptor.name}] Stream aborted by signal`);
          abortedMidStream = true;
          break;
        }
        for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
          if (nodeName === "llmCall" && nodeOutput.messages) {
            const lastMsg = nodeOutput.messages.at(-1) as AIMessageType | undefined;
            if (lastMsg) {
              lastLlmMessage = lastMsg;
              if (!lastMsg.tool_calls?.length) {
                const responseMessage = this.messageMapper.fromLangGraph(lastMsg);
                yielded = true;
                yield {
                  agentName: this.descriptor.name,
                  message: responseMessage,
                  metadata: {},
                  success: true,
                  errorMessage: null,
                };
              }
            }
          }
        }
      }

      if (!yielded && lastLlmMessage) {
        const responseMessage = this.messageMapper.fromLangGraph(lastLlmMessage);
        yield {
          agentName: this.descriptor.name,
          message: responseMessage,
          metadata: {},
          success: true,
          errorMessage: null,
        };
      }

      await this.runHooks("post_agent_call", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        messages: preCtx.messages ?? [],
      }));

      await this.runHooks("pre_summary", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        messages: preCtx.messages ?? [],
      }));

      await this.runHooks("post_summary", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        messages: preCtx.messages ?? [],
      }));

      if (abortedMidStream || options?.signal?.aborted) {
        await this.rollbackSaga("aborted");
        yield {
          agentName: this.descriptor.name,
          message: null,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted by user",
        };
        return;
      }

      this.commitSaga();
    } catch (err) {
      // Handle abort gracefully
      const isAbort = err instanceof Error && (
        err.name === "AbortError" ||
        err.message.includes("abort") ||
        err.message.includes("Abort")
      ) || options?.signal?.aborted;
      if (isAbort) {
        console.log(`[LangGraphAgentAdapter:${this.descriptor.name}] ProcessStream aborted by signal`);
        await this.rollbackSaga("aborted");
        yield {
          agentName: this.descriptor.name,
          message: null,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted by user",
        };
        return;
      }

      if (isToolHitlRequiredError(err)) {
        this.commitSaga();
        throw err;
      }

      if (isToolFastFailError(err)) {
        await this.rollbackSaga(`fast_fail:${err.toolName}`);
      } else {
        await this.rollbackSaga(err instanceof Error ? err.message : String(err));
      }

      await this.runHooks("on_error", HookContext.create({
        agentName: this.descriptor.name,
        sessionId,
        error: err instanceof Error ? err : new Error(String(err)),
      }));
      yield {
        agentName: this.descriptor.name,
        message: null,
        metadata: {},
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
    } finally {
      this.currentProcessOptions = undefined;
    }
  }

  getDescriptor(): AgentDescriptor {
    return this.descriptor;
  }

  getName(): string {
    return this.descriptor.name;
  }
}
