export interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export interface ToolCallContent {
  readonly type: "tool_call";
  readonly callId: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
}

export interface ToolResultContent {
  readonly type: "tool_result";
  readonly callId: string;
  readonly toolName: string;
  readonly output: string;
  readonly isError: boolean;
}

export type ContentBlock = TextContent | ToolCallContent | ToolResultContent;
