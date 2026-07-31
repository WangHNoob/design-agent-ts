import { describe, expect, test } from "vitest";
import { InMemoryVersionStore } from "../../../src/core/versioning/InMemoryVersionStore.js";
import { VersionedSkillRegistry } from "../../../src/core/versioning/VersionedSkillRegistry.js";
import { MarkdownSkill } from "../../../src/core/skill/MarkdownSkill.js";

const SKILL_V1 = `---
name: combat-design
description: "指导 CombatDesignerAgent 完成战斗设计"
---
# v1 content`;

const SKILL_V2 = `---
name: combat-design
description: "指导 CombatDesignerAgent 完成战斗设计"
---
# v2 content`;

describe("InMemoryVersionStore MVCC", () => {
  test("bindSnapshot pins resolved versions per user", async () => {
    let seq = 0;
    const store = new InMemoryVersionStore({ idGenerator: () => `id-${++seq}` });
    const v1 = await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "1.0.0",
      content: SKILL_V1,
      isActive: true,
      canaryPercent: 0,
    });
    await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "2.0.0",
      content: SKILL_V2,
      isActive: false,
      canaryPercent: 0,
    });

    const snapshot = await store.bindSnapshot("user-fixed");
    const binding = snapshot.bindings.find((b) => b.name === "combat-design");
    expect(binding?.versionId).toBeDefined();

    await store.rollback({ kind: "skill", name: "combat-design", versionId: v1.id });

    const pinned = await store.getVersion(binding!.versionId);
    expect(pinned?.content).toContain("# v1 content");
    expect(pinned?.id).toBe(binding?.versionId);
  });

  test("rollback switches active for new resolve but not pinned snapshot", async () => {
    const store = new InMemoryVersionStore();
    const v1 = await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "1.0.0",
      content: SKILL_V1,
      isActive: true,
    });
    const v2 = await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "2.0.0",
      content: SKILL_V2,
      isActive: false,
    });

    const snapshot = await store.bindSnapshot("user-a");
    await store.rollback({ kind: "skill", name: "combat-design", versionId: v2.id });

    const live = await store.resolveForUser("skill", "combat-design", "user-b");
    expect(live?.id).toBe(v2.id);

    const pinnedId = snapshot.bindings.find((b) => b.name === "combat-design")!.versionId;
    const pinned = await store.getVersion(pinnedId);
    expect(pinned?.id).toBe(v1.id);
  });

  test("rejects upsert with different content for same version", async () => {
    const store = new InMemoryVersionStore();
    await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "1.0.0",
      content: SKILL_V1,
      isActive: true,
    });

    await expect(
      store.upsertVersion({
        kind: "skill",
        name: "combat-design",
        version: "1.0.0",
        content: SKILL_V2,
        isActive: true,
      }),
    ).rejects.toThrow(/bump version/i);
  });

  test("allows release-field update on idempotent upsert", async () => {
    const store = new InMemoryVersionStore();
    const created = await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "1.0.0",
      content: SKILL_V1,
      isActive: false,
      canaryPercent: 0,
    });

    const updated = await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "1.0.0",
      content: SKILL_V1,
      isActive: true,
      canaryPercent: 25,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.content).toContain("# v1 content");
    expect(updated.isActive).toBe(true);
    expect(updated.canaryPercent).toBe(25);
  });

  test("snapshot pins content even when same-version upsert is attempted", async () => {
    const store = new InMemoryVersionStore();
    const v1 = await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "1.0.0",
      content: SKILL_V1,
      isActive: true,
      canaryPercent: 0,
    });

    const snapshot = await store.bindSnapshot("user-pinned");
    const binding = snapshot.bindings.find((b) => b.name === "combat-design");
    expect(binding?.versionId).toBe(v1.id);

    await expect(
      store.upsertVersion({
        kind: "skill",
        name: "combat-design",
        version: "1.0.0",
        content: SKILL_V2,
        isActive: true,
      }),
    ).rejects.toThrow(/bump version/i);

    const pinned = await store.getVersion(binding!.versionId);
    expect(pinned?.content).toContain("# v1 content");
  });
});

describe("VersionedSkillRegistry", () => {
  test("uses snapshot-bound skill content for matchSkill", async () => {
    const store = new InMemoryVersionStore();
    const v1 = await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "1.0.0",
      content: SKILL_V1,
      isActive: true,
      canaryPercent: 0,
    });
    await store.upsertVersion({
      kind: "skill",
      name: "combat-design",
      version: "2.0.0",
      content: SKILL_V2,
      isActive: false,
      canaryPercent: 0,
    });

    const snapshot = await store.bindSnapshot("user-x");
    const fallback = {
      register: () => {},
      matchSkill: () => new MarkdownSkill("other", "", "fallback"),
      matchWorkflow: () => null,
      getAll: () => [],
    };
    const registry = new VersionedSkillRegistry(store, snapshot, () => "user-x", fallback);
    await registry.initialize();

    const matched = registry.matchSkill("战斗", "combat_designer");
    expect(matched?.getContent()).toContain("# v1 content");

    await store.setRelease(v1.id, { isActive: false });
    await store.setRelease(
      (await store.listVersions("skill", "combat-design")).find((v) => v.version === "2.0.0")!.id,
      { isActive: true, canaryPercent: 0 },
    );

    const stillPinned = registry.matchSkill("战斗", "combat_designer");
    expect(stillPinned?.getContent()).toContain("# v1 content");
  });
});
