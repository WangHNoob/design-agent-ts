import { describe, expect, test } from "vitest";
import { hashToPercent, selectCanaryVersion } from "../../../src/core/versioning/selectCanaryVersion.js";
import type { ArtifactVersion } from "../../../src/port/versioning/types.js";

function version(
  partial: Partial<ArtifactVersion> & Pick<ArtifactVersion, "id" | "name">,
): ArtifactVersion {
  return {
    kind: "skill",
    version: "1.0.0",
    content: "",
    metadata: {},
    isActive: true,
    canaryPercent: 0,
    whitelistUserIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("selectCanaryVersion", () => {
  test("whitelist takes priority over canary hash", () => {
    const stable = version({ id: "stable", name: "combat-design", canaryPercent: 0 });
    const canary = version({
      id: "canary",
      name: "combat-design",
      canaryPercent: 100,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const whitelisted = version({
      id: "wl",
      name: "combat-design",
      canaryPercent: 0,
      whitelistUserIds: ["user-a"],
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    const picked = selectCanaryVersion([stable, canary, whitelisted], "user-a", "combat-design");
    expect(picked?.id).toBe("wl");
  });

  test("same user gets stable bucket consistently", () => {
    const bucket = hashToPercent("user-123", "my-skill");
    expect(hashToPercent("user-123", "my-skill")).toBe(bucket);
  });

  test("canary routes subset of users to new version", () => {
    const stable = version({ id: "v1", name: "demo", canaryPercent: 0 });
    const canary = version({
      id: "v2",
      name: "demo",
      canaryPercent: 50,
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    const picks = new Map<string, string>();
    for (let i = 0; i < 200; i++) {
      const userId = `user-${i}`;
      const picked = selectCanaryVersion([stable, canary], userId, "demo");
      picks.set(userId, picked?.id ?? "none");
    }
    expect(picks.has("user-0")).toBe(true);
    expect(new Set(picks.values()).size).toBeGreaterThan(1);
  });

  test("falls back to stable active when canary hash misses", () => {
    const stable = version({ id: "stable", name: "x", canaryPercent: 0 });
    const canary = version({
      id: "canary",
      name: "x",
      canaryPercent: 1,
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    let stablePick = 0;
    for (let i = 0; i < 500; i++) {
      const picked = selectCanaryVersion([stable, canary], `u-${i}`, "x");
      if (picked?.id === "stable") stablePick++;
    }
    expect(stablePick).toBeGreaterThan(400);
  });

  test("falls back to newest active when no stable exists", () => {
    const olderCanary = version({
      id: "older",
      name: "only-canary",
      canaryPercent: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newerCanary = version({
      id: "newer",
      name: "only-canary",
      canaryPercent: 20,
      createdAt: "2026-03-01T00:00:00.000Z",
    });

    let userId = "user-miss";
    for (let i = 0; i < 200; i++) {
      const candidate = `user-miss-${i}`;
      const bucket = hashToPercent(candidate, "only-canary");
      if (bucket >= 20) {
        userId = candidate;
        break;
      }
    }

    const picked = selectCanaryVersion([olderCanary, newerCanary], userId, "only-canary");
    expect(picked?.id).toBe("newer");
  });
});
