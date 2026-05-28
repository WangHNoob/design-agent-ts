import type { AgentFactory } from "../../port/agent/AgentFactory.js";
import type { AgentPort } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import type { MemoryPort } from "../../port/memory/MemoryPort.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
import { MockAgentAdapter } from "./MockAgentAdapter.js";

export class MockAgentFactory implements AgentFactory {
  createAgent(
    descriptor: AgentDescriptor,
    _toolRegistry: ToolRegistry,
    _memory: MemoryPort,
    _hooks: AgentHook[]
  ): AgentPort {
    return new MockAgentAdapter(descriptor);
  }
}
