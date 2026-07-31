import type { TaskResult } from "../schema/TaskResult.js";
import type { HandoffLimits, HandoffPayload } from "../schema/HandoffPayload.js";
import { distillHandoff } from "./handoff.js";
import { validateHandoff } from "./handoff.js";
import { isHandoffViolationError } from "./HandoffViolationError.js";

export interface SeedHandoffViolation {
  taskId: string;
  reason: string;
  field?: string;
  source: "resume" | "resume_redistill";
}

/**
 * Seed handoff cache from resumed TaskResults.
 * Invalid handoffs are rejected (callback) then re-distilled from `output` when possible.
 */
export function seedHandoffsFromResults(
  results: readonly TaskResult[],
  limits: HandoffLimits,
  onViolation?: (info: SeedHandoffViolation) => void,
): Map<string, HandoffPayload> {
  const map = new Map<string, HandoffPayload>();
  for (const result of results) {
    if (result.handoff) {
      try {
        validateHandoff(result.handoff, limits);
        map.set(result.taskId, result.handoff);
        continue;
      } catch (err) {
        onViolation?.({
          taskId: result.taskId,
          reason: isHandoffViolationError(err) ? err.reason : String(err),
          field: isHandoffViolationError(err) ? err.field : undefined,
          source: "resume",
        });
      }
    }

    if (result.output?.trim()) {
      const redistilled = distillHandoff({
        taskId: result.taskId,
        domain: result.domain,
        output: result.output,
        artifacts: ["output.md"],
        limits,
      });
      try {
        validateHandoff(redistilled, limits);
        map.set(result.taskId, redistilled);
      } catch (err) {
        onViolation?.({
          taskId: result.taskId,
          reason: isHandoffViolationError(err) ? err.reason : String(err),
          field: isHandoffViolationError(err) ? err.field : undefined,
          source: "resume_redistill",
        });
      }
    }
  }
  return map;
}
