import fs from "fs";
import path from "path";

const promptCache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = promptCache.get(name);
  if (cached) return cached;

  const filePath = path.resolve("prompts", `${name}.md`);
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    promptCache.set(name, content);
    return content;
  } catch {
    console.warn(`[PromptLoader] Prompt file not found: ${filePath}`);
    return "";
  }
}

export function clearPromptCache(): void {
  promptCache.clear();
}
