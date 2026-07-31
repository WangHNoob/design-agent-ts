import type { SkillPort } from "../../port/skill/SkillPort.js";
import type { SkillRegistry } from "../../port/skill/SkillRegistry.js";
import type { VersionStorePort } from "../../port/versioning/VersionStorePort.js";
import type { VersionSnapshot } from "../../port/versioning/types.js";
import { buildSkillFromVersion } from "./skillFromVersion.js";

/**
 * SkillRegistry that resolves skills from a pinned VersionSnapshot (MVCC)
 * or falls back to live resolveForUser / delegate registry.
 */
export class VersionedSkillRegistry implements SkillRegistry {
  private pinnedSkills: SkillPort[] | null = null;

  constructor(
    private readonly versionStore: VersionStorePort,
    private readonly boundSnapshot: VersionSnapshot | null,
    private readonly resolveUserId: () => string | undefined,
    private readonly fallbackRegistry?: SkillRegistry,
  ) {
    if (boundSnapshot) {
      void this.loadPinnedSkills();
    }
  }

  private async loadPinnedSkills(): Promise<void> {
    if (!this.boundSnapshot) return;
    const skills: SkillPort[] = [];
    for (const binding of this.boundSnapshot.bindings) {
      if (binding.kind === "prompt") continue;
      const version = await this.versionStore.getVersion(binding.versionId);
      if (!version) continue;
      const skill = buildSkillFromVersion(version);
      if (skill) skills.push(skill);
    }
    this.pinnedSkills = skills;
  }

  /** Synchronous init for known snapshot — call after construction when snapshot is set. */
  async initialize(): Promise<void> {
    await this.loadPinnedSkills();
  }

  register(_skill: SkillPort): void {
    // Versioned registry is read-only; registration goes through VersionStore.
  }

  matchSkill(requirement: string, role: string): SkillPort | null {
    const registry = this.pinnedSkills ?? this.fallbackRegistry?.getAll() ?? [];
    if (role === "chief_designer") {
      const workflow = this.matchWorkflowFrom(requirement, registry);
      if (workflow) return workflow;
    }

    let best: SkillPort | null = null;
    let bestScore = 0;
    for (const skill of registry) {
      const score = skill.match(requirement, role);
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }
    return best;
  }

  matchWorkflow(requirement: string): SkillPort | null {
    const registry = this.pinnedSkills ?? this.fallbackRegistry?.getAll() ?? [];
    return this.matchWorkflowFrom(requirement, registry);
  }

  private matchWorkflowFrom(requirement: string, registry: readonly SkillPort[]): SkillPort | null {
    let best: SkillPort | null = null;
    let bestScore = 0;
    for (const skill of registry) {
      if (skill.getWorkflowTasks().length === 0) continue;
      const score = skill.match(requirement, "chief_designer");
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }
    return best;
  }

  getAll(): SkillPort[] {
    return [...(this.pinnedSkills ?? this.fallbackRegistry?.getAll() ?? [])];
  }
}
