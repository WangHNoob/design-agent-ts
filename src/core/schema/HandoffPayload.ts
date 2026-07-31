/**
 * Distilled cross-agent handoff. Downstream agents receive this — not full traces.
 */
export interface HandoffPayload {
  readonly taskId: string;
  readonly domain: string;
  /** Distilled conclusion (not full agent output). */
  readonly summary: string;
  /** Bullet-style key points. */
  readonly keyPoints: readonly string[];
  /** Artifact file name references (not file bodies). */
  readonly artifacts?: readonly string[];
  readonly schemaVersion: "1";
  /** True when heuristic distill truncated to limits. */
  readonly truncated?: boolean;
}

export interface HandoffLimits {
  maxChars: number;
  maxKeyPoints: number;
}
