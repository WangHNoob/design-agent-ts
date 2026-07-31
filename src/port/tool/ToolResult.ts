export interface ToolResult {
  readonly output: string;
  readonly isError: boolean;
  readonly metadata: Record<string, unknown>;
}

export namespace ToolResult {
  export function success(output: string, metadata?: Record<string, unknown>): ToolResult {
    return { output, isError: false, metadata: metadata ?? {} };
  }
  export function error(errorMessage: string, metadata?: Record<string, unknown>): ToolResult {
    return { output: errorMessage, isError: true, metadata: metadata ?? {} };
  }
}
