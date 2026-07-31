import type { DirectorPrompts } from "../agent/director/DirectorAgent.js";
import { TaskPlanner } from "../agent/director/TaskPlanner.js";
import { Router } from "../agent/director/Router.js";
import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { SkillRegistry } from "../../port/skill/SkillRegistry.js";
import type { VersionStorePort } from "../../port/versioning/VersionStorePort.js";
import type { VersionSnapshot } from "../../port/versioning/types.js";
import { VersionedSkillRegistry } from "./VersionedSkillRegistry.js";
import { DIRECTOR_PROMPT_NAMES, SUB_AGENT_PROMPT_NAMES } from "./promptMapping.js";

export interface ExecutionOverrides {
  skillRegistry: SkillRegistry;
  taskPlanner: TaskPlanner;
  router: Router;
  querySystemPrompt: string;
  subAgentPrompts: Partial<Record<string, string>>;
}

export interface BuildExecutionOverridesInput {
  versionStore: VersionStorePort;
  snapshot: VersionSnapshot;
  model: ChatModelPort;
  defaultPrompts?: DirectorPrompts;
  defaultQuerySystemPrompt?: string;
  fallbackSkillRegistry?: SkillRegistry;
  resolveUserId?: () => string | undefined;
}

async function resolvePromptContent(
  versionStore: VersionStorePort,
  snapshot: VersionSnapshot,
  promptName: string,
): Promise<string | undefined> {
  const binding = snapshot.bindings.find((b) => b.kind === "prompt" && b.name === promptName);
  if (!binding) return undefined;
  const version = await versionStore.getVersion(binding.versionId);
  return version?.content;
}

/**
 * Build execution-scoped overrides from a pinned VersionSnapshot (MVCC).
 */
export async function buildExecutionOverrides(
  input: BuildExecutionOverridesInput,
): Promise<ExecutionOverrides> {
  const {
    versionStore,
    snapshot,
    model,
    defaultPrompts,
    defaultQuerySystemPrompt = "",
    fallbackSkillRegistry,
  } = input;

  const skillRegistry = new VersionedSkillRegistry(
    versionStore,
    snapshot,
    input.resolveUserId ?? (() => snapshot.userId),
    fallbackSkillRegistry,
  );
  await skillRegistry.initialize();

  const queryContent = await resolvePromptContent(
    versionStore,
    snapshot,
    DIRECTOR_PROMPT_NAMES.querySystem,
  );
  const plannerContent = await resolvePromptContent(
    versionStore,
    snapshot,
    DIRECTOR_PROMPT_NAMES.taskPlanner,
  );
  const routerContent = await resolvePromptContent(
    versionStore,
    snapshot,
    DIRECTOR_PROMPT_NAMES.router,
  );

  const querySystemPrompt = queryContent ?? defaultPrompts?.querySystem ?? defaultQuerySystemPrompt;
  const taskPlannerPrompt = plannerContent ?? defaultPrompts?.taskPlanner;
  const routerPrompt = routerContent ?? defaultPrompts?.router;

  const subAgentPrompts: Partial<Record<string, string>> = {};
  for (const [agentName, promptName] of Object.entries(SUB_AGENT_PROMPT_NAMES)) {
    const content = await resolvePromptContent(versionStore, snapshot, promptName);
    if (content) {
      subAgentPrompts[agentName] = content;
    }
  }

  return {
    skillRegistry,
    taskPlanner: new TaskPlanner(model, taskPlannerPrompt),
    router: new Router(model, routerPrompt),
    querySystemPrompt,
    subAgentPrompts,
  };
}
