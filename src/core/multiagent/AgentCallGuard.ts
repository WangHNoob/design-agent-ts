import { MultiAgentGuardError } from "./MultiAgentGuardError.js";

/** Immutable call-frame for parallel-safe nesting. */
export interface CallContext {
  readonly path: readonly string[];
  /** Depth from Director root (Director=0, first sub-agent=1). */
  readonly depth: number;
}

export interface AgentCallGuardOptions {
  /** Max allowed depth for sub-agents (Director is 0). */
  maxDepth: number;
  /** When true, reject paths that revisit an agent name. */
  detectCycles: boolean;
  /** Root agent label; default "Director". */
  rootName?: string;
}

/**
 * Agent call-stack / call-graph guard.
 *
 * - Pass an explicit `parent` CallContext for parallel fan-out (immutable, race-free).
 * - Omit `parent` to use the sequential stack API (enter/leave) for nested unit tests.
 */
export class AgentCallGuard {
  private sequential: CallContext | null = null;
  private readonly rootName: string;

  constructor(private readonly options: AgentCallGuardOptions) {
    this.rootName = options.rootName ?? "Director";
  }

  /** Root context (Director). Depth = 0. */
  root(name = this.rootName): CallContext {
    return { path: [name], depth: 0 };
  }

  /**
   * Enter a child agent under `parent` (or the sequential stack when parent omitted).
   * Throws MultiAgentGuardError on max_depth / call_cycle.
   */
  enter(agentName: string, parent?: CallContext): CallContext {
    const base = parent ?? this.sequential ?? this.root();
    const nextPath = [...base.path, agentName];

    if (this.options.detectCycles && base.path.includes(agentName)) {
      throw new MultiAgentGuardError({
        code: "call_cycle",
        agentName,
        path: nextPath,
        depth: base.depth + 1,
        maxDepth: this.options.maxDepth,
        reason: `Call cycle detected: ${nextPath.join(" → ")}`,
      });
    }

    const depth = base.depth + 1;
    if (depth > this.options.maxDepth) {
      throw new MultiAgentGuardError({
        code: "max_depth",
        agentName,
        path: nextPath,
        depth,
        maxDepth: this.options.maxDepth,
        reason: `Agent call depth ${depth} exceeds maxDepth ${this.options.maxDepth}`,
      });
    }

    const next: CallContext = { path: nextPath, depth };
    if (parent === undefined) {
      this.sequential = next;
    }
    return next;
  }

  /**
   * Pop the sequential stack. No-op when using explicit parent contexts for parallel work.
   */
  leave(): void {
    if (!this.sequential || this.sequential.path.length <= 1) {
      this.sequential = this.root();
      return;
    }
    const path = this.sequential.path.slice(0, -1);
    this.sequential = { path, depth: Math.max(0, this.sequential.depth - 1) };
  }

  /** Current sequential context (tests / nested helpers). */
  current(): CallContext {
    return this.sequential ?? this.root();
  }
}

/**
 * Nested invoke helper for tests and future Agent-as-Tool wiring.
 * Uses explicit parent so parallel callers remain isolated.
 */
export async function invokeSubAgent<T>(
  guard: AgentCallGuard,
  parent: CallContext,
  agentName: string,
  fn: (ctx: CallContext) => Promise<T>,
): Promise<T> {
  const ctx = guard.enter(agentName, parent);
  return fn(ctx);
}
