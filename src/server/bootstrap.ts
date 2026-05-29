import { createApp } from "./app.js";
import { loadConfig } from "../config/loadConfig.js";
import { Container } from "../config/Container.js";
import { ToolManager } from "../core/tool/ToolManager.js";
import { SkillManager } from "../core/skill/SkillManager.js";
import { DirectorAgent } from "../core/agent/director/DirectorAgent.js";
import { setDirector } from "./routes/console.js";
import { LoggingHook } from "../core/hook/LoggingHook.js";
import { ValidationHook } from "../core/hook/ValidationHook.js";
import { IterationBudgetHook } from "../core/hook/IterationBudgetHook.js";
import { OutputEnforcementHook } from "../core/hook/OutputEnforcementHook.js";
import { ContextManagementHook } from "../core/hook/ContextManagementHook.js";

export function bootstrap() {
  const config = loadConfig();

  if (!config.model.apiKey) {
    throw new Error("LLM_API_KEY is not set. Please configure your environment variables.");
  }

  const toolRegistry = new ToolManager();
  const skillRegistry = new SkillManager();

  const container = new Container(config, toolRegistry, skillRegistry);

  const director = new DirectorAgent({
    model: container.model,
    agentFactory: container.agentFactory,
    toolRegistry,
    skillRegistry,
    humanReviewGateway: container.humanReviewGateway,
    hooks: [
      new LoggingHook(),
      new ValidationHook(),
      new IterationBudgetHook(),
      new OutputEnforcementHook(),
      new ContextManagementHook(),
    ],
  });

  setDirector(director);

  const app = createApp();
  return { app, config, container, director };
}
