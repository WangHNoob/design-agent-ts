import fs from "fs";
import path from "path";
import { loadPrompt } from "./PromptLoader.js";
import { SKILLS_DIR, parseFrontmatter } from "./SkillLoader.js";
import { WORKFLOWS_DIR, parseWorkflowFile } from "./WorkflowLoader.js";
import type { VersionStorePort } from "../port/versioning/VersionStorePort.js";
import type { ArtifactKind } from "../port/versioning/types.js";
import { DIRECTOR_PROMPT_NAMES, SUB_AGENT_PROMPT_NAMES } from "../core/versioning/promptMapping.js";

const INITIAL_VERSION = "1.0.0";

async function isStoreEmpty(versionStore: VersionStorePort): Promise<boolean> {
  for (const kind of ["prompt", "skill", "workflow"] as const) {
    const versions = await versionStore.listVersions(kind);
    if (versions.length > 0) return false;
  }
  return true;
}

async function seedPrompts(versionStore: VersionStorePort): Promise<number> {
  let count = 0;
  const promptNames = [
    ...Object.values(SUB_AGENT_PROMPT_NAMES),
    ...Object.values(DIRECTOR_PROMPT_NAMES),
  ];
  for (const name of promptNames) {
    const content = loadPrompt(name);
    if (!content) continue;
    await versionStore.upsertVersion({
      kind: "prompt",
      name,
      version: INITIAL_VERSION,
      content,
      isActive: true,
      canaryPercent: 0,
    });
    count++;
  }
  return count;
}

async function seedSkills(versionStore: VersionStorePort): Promise<number> {
  if (!fs.existsSync(SKILLS_DIR)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm || entry.name !== fm.name) continue;
    await versionStore.upsertVersion({
      kind: "skill",
      name: fm.name,
      version: INITIAL_VERSION,
      content,
      metadata: { description: fm.description },
      isActive: true,
      canaryPercent: 0,
    });
    count++;
  }
  return count;
}

async function seedWorkflows(versionStore: VersionStorePort): Promise<number> {
  if (!fs.existsSync(WORKFLOWS_DIR)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(WORKFLOWS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(WORKFLOWS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;
    const def = parseWorkflowFile(skillPath);
    if (!def || entry.name !== def.name) continue;
    await versionStore.upsertVersion({
      kind: "workflow",
      name: def.name,
      version: INITIAL_VERSION,
      content: def.content,
      metadata: { description: def.description },
      isActive: true,
      canaryPercent: 0,
    });
    count++;
  }
  return count;
}

/**
 * Import disk prompts/skills/workflows as v1.0.0 when the version store is empty.
 */
export async function seedVersionStoreFromDisk(versionStore: VersionStorePort): Promise<void> {
  if (!(await isStoreEmpty(versionStore))) {
    return;
  }
  const prompts = await seedPrompts(versionStore);
  const skills = await seedSkills(versionStore);
  const workflows = await seedWorkflows(versionStore);
  console.log(
    `[VersionSeeder] Seeded ${prompts} prompts, ${skills} skills, ${workflows} workflows at ${INITIAL_VERSION}`,
  );
}

export async function countArtifacts(versionStore: VersionStorePort, kind: ArtifactKind): Promise<number> {
  return (await versionStore.listVersions(kind)).length;
}
