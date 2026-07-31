import fs from "fs";
import path from "path";
import { MarkdownSkill } from "../core/skill/MarkdownSkill.js";
import { parseSkillFrontmatter } from "../core/skill/parseSkillFrontmatter.js";
import type { SkillRegistry } from "../port/skill/SkillRegistry.js";

export const SKILLS_DIR = path.resolve("contrib", "skills");

/** @deprecated Prefer parseSkillFrontmatter from core; kept for route compatibility. */
export function parseFrontmatter(content: string) {
  return parseSkillFrontmatter(content);
}

/*
 * Load all skills from contrib/skills/{name}/SKILL.md and register them into the given registry.
 */
export function loadSkills(registry: SkillRegistry): void {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.warn(`[SkillLoader] Skills directory not found: ${SKILLS_DIR}`);
    return;
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      console.warn(`[SkillLoader] SKILL.md not found in ${entry.name}`);
      continue;
    }

    const content = fs.readFileSync(skillPath, "utf-8");
    const frontmatter = parseSkillFrontmatter(content);

    if (!frontmatter) {
      console.warn(`[SkillLoader] Failed to parse frontmatter for ${entry.name}`);
      continue;
    }

    // Enforce naming convention: directory name must match skill name
    if (entry.name !== frontmatter.name) {
      console.warn(
        `[SkillLoader] Naming mismatch: directory "${entry.name}" does not match skill name "${frontmatter.name}". Skipping.`
      );
      continue;
    }

    const skill = new MarkdownSkill(
      frontmatter.name,
      frontmatter.description,
      content,
      frontmatter.mcpTools,
    );
    registry.register(skill);
    console.log(`[SkillLoader] Registered skill: ${skill.getName()}`);
  }
}
