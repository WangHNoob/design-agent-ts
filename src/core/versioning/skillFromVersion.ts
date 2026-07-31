import type { ArtifactVersion } from "../../port/versioning/types.js";
import type { SkillPort } from "../../port/skill/SkillPort.js";
import { MarkdownSkill } from "../skill/MarkdownSkill.js";
import { WorkflowSkill } from "../skill/WorkflowSkill.js";
import { parseSkillFrontmatter } from "../skill/parseSkillFrontmatter.js";
import { parseWorkflowContent } from "../skill/parseWorkflowContent.js";

export function buildSkillFromVersion(version: ArtifactVersion): SkillPort | null {
  if (version.kind === "workflow") {
    const def = parseWorkflowContent(version.content);
    if (!def) return null;
    return new WorkflowSkill(
      def.name,
      def.description,
      def.keywords,
      def.tasks,
      version.content,
      def.mcpTools,
    );
  }

  if (version.kind === "skill") {
    const fm = parseSkillFrontmatter(version.content);
    if (!fm) return null;
    return new MarkdownSkill(fm.name, fm.description, version.content, fm.mcpTools);
  }

  return null;
}

export function buildSkillsFromVersions(versions: readonly ArtifactVersion[]): SkillPort[] {
  const skills: SkillPort[] = [];
  for (const version of versions) {
    if (version.kind === "prompt") continue;
    const skill = buildSkillFromVersion(version);
    if (skill) skills.push(skill);
  }
  return skills;
}
