import type { AgentPort } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { AgentResponse } from "../../port/agent/AgentResponse.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../port/message/ChatMessage.js";

export class MockAgentAdapter implements AgentPort {
  private descriptor: AgentDescriptor;
  private presetResponse: AgentResponse;

  constructor(
    descriptor: AgentDescriptor,
    presetResponse?: AgentResponse
  ) {
    this.descriptor = descriptor;
    this.presetResponse = presetResponse ?? {
      agentName: descriptor.name,
      message: CM.text("assistant", descriptor.name, "Mock agent response."),
      metadata: {},
      success: true,
      errorMessage: null,
    };
  }

  async process(_sessionId: string, _messages: ChatMessage[]): Promise<AgentResponse> {
    return this.presetResponse;
  }

  getDescriptor(): AgentDescriptor {
    return this.descriptor;
  }

  getName(): string {
    return this.descriptor.name;
  }
}
