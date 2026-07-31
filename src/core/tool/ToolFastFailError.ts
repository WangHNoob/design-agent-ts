/**
 * Thrown when a tool's declared failure policy is FastFail.
 * Propagates through LangGraphToolAdapter to abort the agent loop.
 */
export class ToolFastFailError extends Error {
  readonly toolName: string;
  readonly causeMessage: string;

  constructor(toolName: string, causeMessage: string) {
    super(`Tool "${toolName}" fast-failed: ${causeMessage}`);
    this.name = "ToolFastFailError";
    this.toolName = toolName;
    this.causeMessage = causeMessage;
  }
}

export function isToolFastFailError(err: unknown): err is ToolFastFailError {
  return err instanceof ToolFastFailError;
}
