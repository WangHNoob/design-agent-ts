import { StateGraph, Annotation, START, END, type MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { BaseMessage, AIMessage as AIMessageType } from "@langchain/core/messages";
import { SystemMessage, HumanMessage, AIMessage, AIMessageChunk } from "@langchain/core/messages";
import type { AgentPort, AgentProcessOptions } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { AgentResponse } from "../../port/agent/AgentResponse.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
import { HookContext } from "../../port/hook/HookContext.js";
import { LangGraphMessageMapper } from "./LangGraphMessageMapper.js";
import { LangGraphToolAdapter } from "./LangGraphToolAdapter.js";

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  sessionId: Annotation<string>({ value: (_x, y) => y }),
  iteration: Annotation<number>({ value: (_x, y) => y, default: () => 0 }),
});

export class LangGraphAgentAdapter implements AgentPort {
  private descriptor: AgentDescriptor;
  private compiledGraph: unknown;
  private messageMapper = new LangGraphMessageMapper();
  private toolAdapter = new LangGraphToolAdapter();

  constructor(
    descriptor: AgentDescriptor,
    tools: ToolPort[],
    private model: unknown,
    private hooks: AgentHook[],
    private checkpointer?: MemorySaver
  ) {
    this.descriptor = descriptor;
    this.compiledGraph = this.buildGraph(tools);
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
  private async aggregateStream(chunks: AsyncIterable<AIMessageChunk>): Promise<AIMessage> {
    const contentBlocks = new Map<string, Record<string, unknown>>();
    let textContent = "";
    let hasArrayContent = false;
    const toolCallMap = new Map<string, { id: string; name: string; args: string }>();
    let lastMetadata: Record<string, unknown> = {};
    let lastAdditionalKwargs: Record<string, unknown> = {};
    let usageInput = 0;
    let usageOutput = 0;

    for await (const chunk of chunks) {
      const content = chunk.content;

      if (typeof content === "string") {
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
              existing.text += b.text;
            }
            if (typeof existing.partial_json === "string" && typeof b.partial_json === "string") {
              existing.partial_json += b.partial_json;
            }
          } else {
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
        lastAdditionalKwargs = { ...lastAdditionalKwargs, ...chunk.additional_kwargs };
      }
      if (chunk.usage_metadata?.input_tokens) usageInput = chunk.usage_metadata.input_tokens;
      if (chunk.usage_metadata?.output_tokens) usageOutput = chunk.usage_metadata.output_tokens;
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

  private buildGraph(tools: ToolPort[]) {
    const lgTools = this.toolAdapter.toLangGraphTools(tools);
    const modelWithTools = (this.model as { bindTools(tools: unknown[]): unknown }).bindTools(lgTools);
    const descriptor = this.descriptor;
    const hooks = this.hooks;
    const runHooks = this.runHooks.bind(this);

    const llmCall = async (state: typeof AgentState.State, config?: { signal?: AbortSignal }) => {
      // Early abort check
      if (config?.signal?.aborted) {
        console.log(`[LangGraphAgentAdapter:${descriptor.name}] Aborted before LLM call`);
        return { messages: [], iteration: state.iteration };
      }

      const hookCtx = HookContext.create({
        agentName: descriptor.name,
        sessionId: state.sessionId,
        iteration: state.iteration,
        maxIterations: descriptor.maxIterations,
        messages: state.messages.map((m) => this.messageMapper.fromLangGraph(m)),
      });
      const preCtx = await runHooks("pre_reasoning", hookCtx);
      if (preCtx.abort) {
        const reason = preCtx.abortReason ?? "Aborted by pre_reasoning hook";
        console.warn(`[LangGraphAgentAdapter:${descriptor.name}] ${reason}`);
        throw new Error(reason);
      }

      try {
        // Use messages possibly modified by hooks (compression, budget warnings, etc.)
        const effectiveMessages = preCtx.messages
          ? preCtx.messages.map((m) => this.messageMapper.toLangGraph(m))
          : state.messages;

        const systemMsg = new SystemMessage({ content: descriptor.systemPrompt });

        // Inline iteration-budget injection (remaining iterations <= 3).
        // Use HumanMessage instead of SystemMessage because Anthropic only
        // allows system messages as the first message in the conversation.
        const remaining = descriptor.maxIterations - state.iteration;
        const injectedMessages = [...effectiveMessages];
        if (remaining === 1) {
          injectedMessages.push(
            new HumanMessage({ content: "【系统提示】这是最后一次推理机会。你必须立即输出完整的文本结果，禁止发起任何工具调用。" })
          );
        } else if (remaining <= 3 && remaining > 0) {
          injectedMessages.push(
            new HumanMessage({ content: `【系统提示】剩余推理次数: ${remaining}。请尽快总结并输出最终设计内容，不要再调用工具。` })
          );
        }

        console.log(`[LangGraphAgentAdapter:${descriptor.name}] LLM invoke (streaming) with maxTokens=${descriptor.maxTokens ?? "undefined"}`);
        // Use streaming internally to avoid Anthropic SDK's 10-minute timeout
        // for non-streaming requests with high max_tokens.
        const streamOptions: Record<string, unknown> = descriptor.maxTokens ? { maxTokens: descriptor.maxTokens } : {};
        if (config?.signal) {
          streamOptions.signal = config.signal;
        }
        const stream = await (modelWithTools as {
          stream(msgs: BaseMessage[], options?: Record<string, unknown>): AsyncIterable<AIMessageChunk>;
        }).stream([systemMsg, ...injectedMessages], streamOptions);

        const response = await this.aggregateStream(stream);

        const metadata = response.response_metadata as Record<string, unknown> | undefined;
        const finishReason = (metadata?.finish_reason ?? metadata?.stop_reason) as string | undefined;
        console.log(`[LangGraphAgentAdapter:${descriptor.name}] LLM response finish_reason=${finishReason ?? "unknown"}, contentLength=${typeof response.content === "string" ? response.content.length : JSON.stringify(response.content).length}`);

        const postCtx = await runHooks("post_reasoning", HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          iteration: state.iteration,
          messages: [...(preCtx.messages ?? []), this.messageMapper.fromLangGraph(response)],
          inputTokenCount: response.usage_metadata?.input_tokens ?? 0,
          outputTokenCount: response.usage_metadata?.output_tokens ?? 0,
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
          return { messages: [], iteration: state.iteration };
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
    const wrappedToolNode = async (state: typeof AgentState.State) => {
      const lastMessage = state.messages.at(-1) as AIMessageType | undefined;
      const toolCalls = lastMessage?.tool_calls ?? [];

      for (const tc of toolCalls) {
        const preCtx = HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          toolName: tc.name,
          toolArguments: tc.args as Record<string, unknown>,
        });
        const afterPre = await runHooks("pre_tool_execution", preCtx);
        if (afterPre.abort) {
          const reason = afterPre.abortReason ?? `Tool execution aborted: ${tc.name}`;
          console.warn(`[LangGraphAgentAdapter:${descriptor.name}] ${reason}`);
          throw new Error(reason);
        }
      }

      const result = await toolNode.invoke(state);

      for (const tc of toolCalls) {
        const metadata = this.toolAdapter.lastToolMetadata.get(tc.name) || {};
        const postCtx = HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          toolName: tc.name,
          toolResult: JSON.stringify(result.messages.at(-1)?.content ?? ""),
          metadata: { toolResultMetadata: metadata },
        });
        await runHooks("post_tool_execution", postCtx);
      }

      return result;
    };

    const forceFinalOutput = async (state: typeof AgentState.State, config?: { signal?: AbortSignal }) => {
      console.warn(`[LangGraphAgentAdapter:${descriptor.name}] Iteration budget exhausted with pending tool calls. Forcing final text output.`);
      const rawModel = this.model as { stream(msgs: BaseMessage[], options?: Record<string, unknown>): AsyncIterable<AIMessageChunk> };
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
        await rawModel.stream([systemMsg, ...state.messages, finalInstruction], streamOptions)
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

      const lgMessages = this.messageMapper.toLangGraphList(messages);
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
        return {
          agentName: this.descriptor.name,
          message: null,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted by user",
        };
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
    }
  }

  async *processStream(sessionId: string, messages: ChatMessage[], options?: AgentProcessOptions): AsyncIterable<AgentResponse> {
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

      for await (const chunk of stream) {
        // Check abort between chunks
        if (options?.signal?.aborted) {
          console.log(`[LangGraphAgentAdapter:${this.descriptor.name}] Stream aborted by signal`);
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
    } catch (err) {
      // Handle abort gracefully
      const isAbort = err instanceof Error && (
        err.name === "AbortError" ||
        err.message.includes("abort") ||
        err.message.includes("Abort")
      ) || options?.signal?.aborted;
      if (isAbort) {
        console.log(`[LangGraphAgentAdapter:${this.descriptor.name}] ProcessStream aborted by signal`);
        yield {
          agentName: this.descriptor.name,
          message: null,
          metadata: { aborted: true },
          success: false,
          errorMessage: "Aborted by user",
        };
        return;
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
  }

  getDescriptor(): AgentDescriptor {
    return this.descriptor;
  }

  getName(): string {
    return this.descriptor.name;
  }
}
