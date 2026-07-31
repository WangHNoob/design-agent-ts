import type { FrameworkConfig } from "../../config/FrameworkConfig.js";
import type { VersionStorePort } from "../../port/versioning/VersionStorePort.js";
import type { SessionMeta } from "../../port/session/SessionRepository.js";
import { buildExecutionOverrides } from "../../core/versioning/buildExecutionOverrides.js";
import type { ExecutionOverrides } from "../../core/versioning/buildExecutionOverrides.js";
import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { DirectorPrompts } from "../../core/agent/director/DirectorAgent.js";
import type { SkillRegistry } from "../../port/skill/SkillRegistry.js";

export interface SessionVersionBindingInput {
  sessionRepository: {
    get(id: string): Promise<SessionMeta | null>;
    create(meta: SessionMeta): Promise<void>;
    update(id: string, patch: Partial<SessionMeta>): Promise<void>;
  };
  userId: string;
  sessionId: string;
  config: FrameworkConfig;
  versionStore: VersionStorePort | null;
}

function assertVersionStoreAvailable(
  config: FrameworkConfig,
  versionStore: VersionStorePort | null,
): asserts versionStore is VersionStorePort {
  if (!config.versioning.enabled) return;
  if (!versionStore) {
    throw new Error("VERSIONING_ENABLED but version store is unavailable");
  }
}

/**
 * Bind or reuse a version snapshot for a session (MVCC).
 */
export async function ensureSessionVersionSnapshot(
  input: SessionVersionBindingInput,
): Promise<string | undefined> {
  if (!input.config.versioning.enabled) {
    return undefined;
  }
  assertVersionStoreAvailable(input.config, input.versionStore);

  const existing = await input.sessionRepository.get(input.sessionId);
  if (existing?.versionSnapshotId) {
    return existing.versionSnapshotId;
  }

  const snapshot = await input.versionStore.bindSnapshot(input.userId);
  if (existing) {
    await input.sessionRepository.update(input.sessionId, {
      versionSnapshotId: snapshot.id,
    });
  }
  return snapshot.id;
}

export interface ResolveExecutionOverridesInput {
  versionStore: VersionStorePort | null;
  config: FrameworkConfig;
  sessionMeta: SessionMeta | null;
  sessionUserId: string;
  model: ChatModelPort;
  defaultPrompts?: DirectorPrompts;
  defaultQuerySystemPrompt?: string;
  fallbackSkillRegistry?: SkillRegistry;
}

export async function resolveExecutionOverrides(
  input: ResolveExecutionOverridesInput,
): Promise<ExecutionOverrides | undefined> {
  if (!input.config.versioning.enabled || !input.versionStore) {
    return undefined;
  }

  if (!input.sessionMeta?.versionSnapshotId) {
    console.warn("[Versioning] Session missing versionSnapshotId; falling back to global latest", {
      sessionId: input.sessionMeta?.id,
      userId: input.sessionUserId,
      versioningFallback: true,
    });
    return undefined;
  }

  const snapshot = await input.versionStore.getSnapshot(input.sessionMeta.versionSnapshotId);
  if (!snapshot) {
    throw new Error(
      `Version snapshot ${input.sessionMeta.versionSnapshotId} not found; refusing silent global fallback`,
    );
  }

  if (snapshot.userId !== input.sessionUserId) {
    throw new Error(
      `Version snapshot ${snapshot.id} belongs to user ${snapshot.userId}, not ${input.sessionUserId}`,
    );
  }

  return buildExecutionOverrides({
    versionStore: input.versionStore,
    snapshot,
    model: input.model,
    defaultPrompts: input.defaultPrompts,
    defaultQuerySystemPrompt: input.defaultQuerySystemPrompt,
    fallbackSkillRegistry: input.fallbackSkillRegistry,
    resolveUserId: () => input.sessionUserId,
  });
}
