export interface AgentDescriptor {
  readonly name: string;
  readonly systemPrompt: string;
  readonly maxIterations: number;
  readonly maxTokens?: number;
  readonly toolNames: string[];
  /**
   * 单条工具结果进入模型上下文的最大字符数（0=不截断）。
   * 长 KB envelope 会撑爆上下文（评测 token 风暴根因之一）；knowledge-hub
   * 侧精简后此兜底少触发。
   */
  readonly toolResultMaxChars?: number;
  readonly options: Record<string, unknown>;
}
