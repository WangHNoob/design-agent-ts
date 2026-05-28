import { StateGraph, Annotation, START, END, type MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { BaseMessage, AIMessage as AIMessageType } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";
import type { AgentPort } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { AgentResponse } from "../../port/agent/AgentResponse.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
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

  private buildGraph(tools: ToolPort[]) {
    const lgTools = this.toolAdapter.toLangGraphTools(tools);
    const modelWithTools = (this.model as { bindTools(tools: unknown[]): unknown }).bindTools(lgTools);

    const llmCall = async (state: typeof AgentState.State) => {
      const systemMsg = new SystemMessage({ content: this.descriptor.systemPrompt });
      const response = await (modelWithTools as { invoke(msgs: BaseMessage[]): Promise<BaseMessage> }).invoke([systemMsg, ...state.messages]);
      return { messages: [response], iteration: state.iteration + 1 };
    };

    const toolNode = new ToolNode(lgTools);

    const shouldContinue = (state: typeof AgentState.State) => {
      if (state.iteration >= this.descriptor.maxIterations) {
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
      .addNode("tools", toolNode)
      .addEdge(START, "llmCall")
      .addConditionalEdges("llmCall", shouldContinue, ["tools", END])
      .addEdge("tools", "llmCall");

    return builder.compile({ checkpointer: this.checkpointer });
  }

  async process(sessionId: string, messages: ChatMessage[]): Promise<AgentResponse> {
    try {
      const lgMessages = this.messageMapper.toLangGraphList(messages);
      const config = { configurable: { thread_id: sessionId } };

      const compiled = this.compiledGraph as { invoke(state: unknown, config: unknown): Promise<{ messages: BaseMessage[] }> };
      const result = await compiled.invoke(
        { messages: lgMessages, sessionId, iteration: 0 },
        config
      );

      const lastMessage = result.messages.at(-1);
      const responseMessage = lastMessage
        ? this.messageMapper.fromLangGraph(lastMessage)
        : null;

      return {
        agentName: this.descriptor.name,
        message: responseMessage,
        metadata: {},
        success: true,
        errorMessage: null,
      };
    } catch (err) {
      return {
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
