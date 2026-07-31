import type { AgentFactory } from "../port/agent/AgentFactory.js";
import type { ChatModelPort } from "../port/model/ChatModelPort.js";
import type { ToolRegistry } from "../port/tool/ToolRegistry.js";
import type { SkillRegistry } from "../port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../core/agent/director/HumanReviewGateway.js";
import type { FrameworkConfig } from "../config/FrameworkConfig.js";
import type { ModelConfig } from "../port/model/ModelConfig.js";
import { LangGraphAgentFactory } from "../adapter/langgraph/LangGraphAgentFactory.js";
import { LangGraphModelAdapter } from "../adapter/langgraph/LangGraphModelAdapter.js";
import { LangGraphHumanReviewGateway } from "../adapter/langgraph/LangGraphHumanReviewGateway.js";
import { MockModelAdapter } from "../adapter/mock/MockModelAdapter.js";
import { MockAgentFactory } from "../adapter/mock/MockAgentFactory.js";
import { MockHumanReviewGateway } from "../adapter/mock/MockHumanReviewGateway.js";

export class Container {
  readonly model: ChatModelPort;
  readonly agentFactory: AgentFactory;
  readonly humanReviewGateway: HumanReviewGateway;

  constructor(
    readonly config: FrameworkConfig,
    readonly toolRegistry: ToolRegistry,
    readonly skillRegistry: SkillRegistry,
  ) {
    switch (config.framework) {
      case "langgraph": {
        const primary: ModelConfig = {
          provider: config.model.provider,
          modelName: config.model.modelName,
          apiKey: config.model.apiKey,
          baseUrl: config.model.baseUrl,
          maxTokens: config.limits.modelMaxTokens,
        };
        const fallbacks: ModelConfig[] = config.model.fallbackModels.map((modelName) => ({
          ...primary,
          modelName,
        }));
        const model = new LangGraphModelAdapter(primary, {
          fallbacks,
          failureThreshold: config.model.fallbackFailureThreshold,
          cooldownMs: config.model.fallbackCooldownMs,
        });
        this.model = model;
        this.agentFactory = new LangGraphAgentFactory(model);
        this.humanReviewGateway = new LangGraphHumanReviewGateway();
        break;
      }
      case "mock":
        this.model = new MockModelAdapter();
        this.agentFactory = new MockAgentFactory();
        this.humanReviewGateway = new MockHumanReviewGateway();
        break;
    }
  }

  reconfigureModel(config: ModelConfig): void {
    if (this.model instanceof LangGraphModelAdapter) {
      this.model.reconfigure(config);
      if (this.agentFactory instanceof LangGraphAgentFactory) {
        this.agentFactory.clearCache();
      }
    }
  }
}
