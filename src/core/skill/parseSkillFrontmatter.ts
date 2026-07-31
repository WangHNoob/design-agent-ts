export interface SkillFrontmatter {
  name: string;
  description: string;
  /** MCP tool names / prefixes (e.g. kb_*, kb_search). */
  mcpTools: string[];
}

function extractStringList(yaml: string, key: string): string[] {
  const re = new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)*)`, "m");
  const m = yaml.match(re);
  if (m) {
    return (m[1]!.match(/-\s+"[^"\n]*"|-\s+[^"\n]+/g) ?? [])
      .map((s) => s.replace(/^-\s+/, "").replace(/^"(.*)"$/, "$1").trim())
      .filter((s) => s.length > 0);
  }
  const inline = yaml.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline) {
    return (inline[1]!.match(/"([^"]+)"|([^,\s]+)/g) ?? [])
      .map((s) => s.replace(/^"/, "").replace(/"$/, "").trim())
      .filter((s) => s.length > 0);
  }
  return [];
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
    mcpTools: extractStringList(yamlBlock, "mcpTools"),
  };
}
