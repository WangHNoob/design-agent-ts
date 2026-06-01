import type { AgentFactory } from "../../port/agent/AgentFactory.js";
import type { AgentPort } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import type { MemoryPort } from "../../port/memory/MemoryPort.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { AgentResponse } from "../../port/agent/AgentResponse.js";
import { MockAgentAdapter } from "./MockAgentAdapter.js";

export class MockAgentFactory implements AgentFactory {
  private presetResponses = new Map<string, AgentResponse>();

  setPresetResponse(agentName: string, response: AgentResponse): void {
    this.presetResponses.set(agentName, response);
  }

  createAgent(
    descriptor: AgentDescriptor,
    _toolRegistry: ToolRegistry,
    _memory: MemoryPort,
    _hooks: AgentHook[]
  ): AgentPort {
    return new MockAgentAdapter(descriptor, this.presetResponses.get(descriptor.name));
  }
}
