import { describe, expect, test, vi } from "vitest";
import { InMemoryVersionStore } from "../../../src/core/versioning/InMemoryVersionStore.js";
import { resolveExecutionOverrides } from "../../../src/server/versioning/sessionVersionBinding.js";
import type { FrameworkConfig } from "../../../src/config/FrameworkConfig.js";
import type { SessionMeta } from "../../../src/port/session/SessionRepository.js";

const versioningConfig = {
  enabled: true,
  defaultCanaryPercent: 0,
  snapshotTtlMs: 0,
} as FrameworkConfig["versioning"];

const session: SessionMeta = {
  id: "session-1",
  requirement: "test",
  mode: "query",
  role: "chief_designer",
  status: "queued",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  versionSnapshotId: "snap-1",
};

describe("resolveExecutionOverrides", () => {
  test("throws when snapshot id is missing in store", async () => {
    const store = new InMemoryVersionStore();
    await expect(
      resolveExecutionOverrides({
        versionStore: store,
        config: { versioning: versioningConfig } as FrameworkConfig,
        sessionMeta: session,
        sessionUserId: "user-a",
        model: { stream: async function* () {} },
      }),
    ).rejects.toThrow(/not found/i);
  });

  test("throws when snapshot userId does not match session user", async () => {
    const store = new InMemoryVersionStore();
    await store.saveSnapshot({
      id: "snap-1",
      userId: "owner-a",
      bindings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(
      resolveExecutionOverrides({
        versionStore: store,
        config: { versioning: versioningConfig } as FrameworkConfig,
        sessionMeta: session,
        sessionUserId: "user-b",
        model: { stream: async function* () {} },
      }),
    ).rejects.toThrow(/belongs to user/i);
  });

  test("warns and returns undefined for legacy sessions without snapshot id", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new InMemoryVersionStore();

    const result = await resolveExecutionOverrides({
      versionStore: store,
      config: { versioning: versioningConfig } as FrameworkConfig,
      sessionMeta: { ...session, versionSnapshotId: undefined },
      sessionUserId: "user-a",
      model: { stream: async function* () {} },
    });

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("versionSnapshotId"),
      expect.objectContaining({ versioningFallback: true }),
    );
    warnSpy.mockRestore();
  });
});
