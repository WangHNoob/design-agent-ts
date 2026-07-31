/**
 * Multi-agent runaway guard violation (depth / call cycle / fan-out policy).
 * Fail loud and auditable — never silently continue.
 */
export class MultiAgentGuardError extends Error {
  readonly code: "max_depth" | "call_cycle" | "token_budget";
  readonly agentName?: string;
  readonly path?: readonly string[];
  readonly depth?: number;
  readonly maxDepth?: number;
  readonly reason: string;

  constructor(input: {
    code: MultiAgentGuardError["code"];
    reason: string;
    agentName?: string;
    path?: readonly string[];
    depth?: number;
    maxDepth?: number;
  }) {
    const pathSuffix = input.path?.length ? ` path=${input.path.join("→")}` : "";
    super(`Multi-agent guard [${input.code}]${pathSuffix}: ${input.reason}`);
    this.name = "MultiAgentGuardError";
    this.code = input.code;
    this.reason = input.reason;
    this.agentName = input.agentName;
    this.path = input.path;
    this.depth = input.depth;
    this.maxDepth = input.maxDepth;
  }
}

export function isMultiAgentGuardError(err: unknown): err is MultiAgentGuardError {
  return err instanceof MultiAgentGuardError
    || (typeof err === "object"
      && err !== null
      && (err as { name?: string }).name === "MultiAgentGuardError");
}
