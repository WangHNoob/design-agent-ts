import type { Domain } from "./TaskPlan.js";
import type { ExecutionErrorClass } from "../../port/execution/types.js";
import type { HandoffPayload } from "./HandoffPayload.js";

export interface TaskResult {
  readonly taskId: string;
  readonly domain: Domain;
  readonly status: "success" | "error" | "pending" | "rejected" | "cancelled" | "skipped";
  readonly output: string;
  readonly errorMessage: string | null;
  readonly errorClass?: ExecutionErrorClass;
  /** Distilled handoff for downstream agents (full output still in `output` / workspace). */
  readonly handoff?: HandoffPayload;
  /** HITL-2 checkpoint 信息（status === "pending" 时携带，供执行流转 waiting_hitl）。 */
  readonly reviewPoint?: string;
  readonly checkpointId?: string;
  readonly resumeCursor?: string;
}
