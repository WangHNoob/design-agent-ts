export interface ModelOptions {
  readonly maxTokens?: number;
  readonly maxCompletionTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly stopSequences?: string[];
}

export namespace ModelOptions {
  export const defaults: ModelOptions = {
    maxTokens: 32768,
    maxCompletionTokens: 32768,
  };
}
