export interface ModelConfig {
  provider: "openai" | "anthropic" | "openai-compatible";
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
}
