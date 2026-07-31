export interface SkillFrontmatter {
  name: string;
  description: string;
}

export function parseSkillFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return null;

  const yamlBlock = match[1]!;
  const nameMatch = yamlBlock.match(/name:\s*"?([^"\n]+)"?/);
  const descMatch = yamlBlock.match(/description:\s*"?([^"\n]+)"?/);

  if (!nameMatch?.[1]) return null;

  return {
    name: nameMatch[1].trim().replace(/"$/, ""),
    description: descMatch?.[1] ? descMatch[1].trim().replace(/"$/, "") : "",
  };
}
