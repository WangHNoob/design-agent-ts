export interface AgentDescriptor {
  readonly name: string;
  readonly systemPrompt: string;
  readonly maxIterations: number;
  readonly toolNames: string[];
  readonly options: Record<string, unknown>;
}
