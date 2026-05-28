import type { AgentPort } from "./AgentPort.js";
import type { AgentDescriptor } from "./AgentDescriptor.js";
import type { ToolRegistry } from "../tool/ToolRegistry.js";
import type { MemoryPort } from "../memory/MemoryPort.js";
import type { AgentHook } from "../hook/AgentHook.js";

export interface AgentFactory {
  createAgent(
    descriptor: AgentDescriptor,
    toolRegistry: ToolRegistry,
    memory: MemoryPort,
    hooks: AgentHook[]
  ): AgentPort;
}
