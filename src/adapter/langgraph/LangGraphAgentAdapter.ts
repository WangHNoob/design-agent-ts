import { StateGraph, Annotation, START, END, type MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { BaseMessage, AIMessage as AIMessageType } from "@langchain/core/messages";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import type { AgentPort } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { AgentResponse } from "../../port/agent/AgentResponse.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
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

    const llmCall = async (state: typeof AgentState.State) => {
      const hookCtx = HookContext.create({
        agentName: descriptor.name,
        sessionId: state.sessionId,
        iteration: state.iteration,
        maxIterations: descriptor.maxIterations,
        messages: state.messages.map((m) => this.messageMapper.fromLangGraph(m)),
      });
      const preCtx = await runHooks("pre_reasoning", hookCtx);
      if (preCtx.abort) {
        return { messages: [], iteration: state.iteration };
      }

      try {
        const systemMsg = new SystemMessage({ content: descriptor.systemPrompt });
        const response = await (modelWithTools as { invoke(msgs: BaseMessage[]): Promise<BaseMessage> }).invoke([systemMsg, ...state.messages]);

        const postCtx = await runHooks("post_reasoning", HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          iteration: state.iteration,
          messages: [...(preCtx.messages ?? []), this.messageMapper.fromLangGraph(response)],
        }));

        return { messages: [response], iteration: state.iteration + 1 };
      } catch (err) {
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
        await runHooks("pre_tool_execution", preCtx);
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

    const shouldContinue = (state: typeof AgentState.State) => {
      if (state.iteration >= descriptor.maxIterations) {
        runHooks("on_iteration_budget", HookContext.create({
          agentName: descriptor.name,
          sessionId: state.sessionId,
          iteration: state.iteration,
          maxIterations: descriptor.maxIterations,
        })).catch(() => {});
        return END;
      }
      const lastMessage = state.messages.at(-1) as AIMessageType | undefined;
      if (lastMessage?.tool_calls?.length) {
        return "tools";
      }
      return END;
    };

    const builder = new StateGraph(AgentState)
      .addNode("llmCall", llmCall)
      .addNode("tools", wrappedToolNode)
      .addEdge(START, "llmCall")
      .addConditionalEdges("llmCall", shouldContinue, ["tools", END])
      .addEdge("tools", "llmCall");

    return builder.compile({ checkpointer: this.checkpointer });
  }

  async process(sessionId: string, messages: ChatMessage[]): Promise<AgentResponse> {
    try {
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
      const recursionLimit = this.descriptor.maxIterations * 2 + 2;
      const config = { configurable: { thread_id: sessionId }, recursionLimit };

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

      const responseMessage = lastMessage
        ? this.messageMapper.fromLangGraph(lastMessage)
        : null;

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

      return {
        agentName: this.descriptor.name,
        message: responseMessage,
        metadata: {},
        success: true,
        errorMessage: null,
      };
    } catch (err) {
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

  async *processStream(sessionId: string, messages: ChatMessage[]): AsyncIterable<AgentResponse> {
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
    const recursionLimit = this.descriptor.maxIterations * 2 + 2;
    const config = { configurable: { thread_id: sessionId }, streamMode: "updates" as const, recursionLimit };

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
    } catch (err) {
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
