import type { SessionPort } from "../../port/session/SessionPort.js";
import type { SessionKey } from "../../port/session/SessionKey.js";
import fs from "fs/promises";
import path from "path";

export class LangGraphSessionAdapter implements SessionPort {
  constructor(private baseDir: string = "sessions") {}

  /** Same segment sanitization as WorkspaceManager — never trust key components in paths. */
  private sanitize(segment: string): string {
    return segment
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/^\.+/, "_")
      .trim() || "_";
  }

  private dirFor(key: SessionKey): string {
    return path.join(this.baseDir, this.sanitize(key.sessionId), this.sanitize(key.namespace ?? "default"));
  }

  async save(key: SessionKey, state: Record<string, unknown>): Promise<void> {
    const dir = this.dirFor(key);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
  }

  async load(key: SessionKey): Promise<Record<string, unknown> | null> {
    try {
      const filePath = path.join(this.dirFor(key), "state.json");
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async delete(key: SessionKey): Promise<void> {
    try {
      await fs.rm(path.join(this.baseDir, this.sanitize(key.sessionId)), { recursive: true });
    } catch {
      // ignore
    }
  }

  async exists(key: SessionKey): Promise<boolean> {
    try {
      await fs.access(path.join(this.dirFor(key), "state.json"));
      return true;
    } catch {
      return false;
    }
  }
}
