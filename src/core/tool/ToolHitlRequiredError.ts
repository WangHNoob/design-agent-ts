/**
 * Thrown when an irreversible tool requires human approval and execution should pause.
 * Propagates to DirectorAgent to emit a HITL checkpoint event.
 */
export class ToolHitlRequiredError extends Error {
  readonly toolName: string;
  readonly checkpointId: string;
  readonly argsHash: string;

  constructor(toolName: string, checkpointId: string, argsHash: string) {
    super(`Tool "${toolName}" requires human approval (checkpoint ${checkpointId})`);
    this.name = "ToolHitlRequiredError";
    this.toolName = toolName;
    this.checkpointId = checkpointId;
    this.argsHash = argsHash;
  }
}

export function isToolHitlRequiredError(err: unknown): err is ToolHitlRequiredError {
  return err instanceof ToolHitlRequiredError;
}
