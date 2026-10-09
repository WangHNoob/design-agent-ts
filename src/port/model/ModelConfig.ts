/**
 * 统一的思考（reasoning）配置：设置界面暴露五档 + 可选精确预算，
 * 模型适配层按 models.dev 注册表里该模型的 reasoning_options 类型
 * 分发到各家参数（effort 档位 / 开关 / 预算）。
 */
export type ReasoningMode = "off" | "minimal" | "low" | "medium" | "high";

export interface ReasoningConfig {
  mode: ReasoningMode;
  /**
   * 精确思考档位（模型注册表 reasoning_options 的 effort values 原值，
   * 如 max/xhigh/none）。存在且被模型支持时优先于 mode；缺省按 mode
   * 换算到模型档位。
   */
  effort?: string;
  /** 显式思考预算（tokens）；仅预算型思考的模型使用，缺省按档位换算 */
  budgetTokens?: number;
}

export interface ModelConfig {
  /**
   * 内置协议（openai / anthropic / openai-compatible）或 models.dev 注册表
   * provider id（deepseek / zai / alibaba …）。注册表 id 在构建模型时解析为
   * 协议 + 默认 baseURL，并作为思考参数映射的元数据查询键。
   */
  provider: string;
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  reasoning?: ReasoningConfig;
}
