// Re-export skill-domain types from the port layer (single source of truth).
// Ports must not import core; core may import ports.
import type { Domain, OutputType, WorkflowTask } from "../../port/skill/SkillTypes.js";
export type { Domain, OutputType, WorkflowTask } from "../../port/skill/SkillTypes.js";

export interface SubTask {
  readonly id: string;
  readonly fragmentId: string;
  readonly domain: Domain;
  readonly description: string;
  readonly dependencies: string[];
  readonly priority: number;
  /**
   * Step-level tool whitelist for plan hard guards.
   * - omitted / undefined: resolve via domain defaults (`planDomainToolDefaults` / core defaults)
   * - empty array `[]`: **no external tools** — only agent reasoning without tool calls
   * - non-empty: intersected with `AgentDescriptor.toolNames` (+ session tools when listed)
   */
  readonly allowedTools?: readonly string[];
}

export interface TaskPlan {
  readonly planId: string;
  readonly requirement: string;
  readonly subTasks: SubTask[];
  /** Set when the plan was derived from a workflow skill. */
  readonly skillId?: string;
  /**
   * Auditable mark: structured LLM parse exhausted and a fallback plan was used.
   * Never treat a silent empty plan as success — prefer this flag or a loud failure.
   */
  readonly fallback?: boolean;
  /** Alias of fallback for parse-path degradation (structured output closed loop). */
  readonly parseFallback?: boolean;
  /** Human-readable planning warnings (LLM degrade / template fallback). Surfaced on SSE. */
  readonly warnings?: readonly string[];
}
