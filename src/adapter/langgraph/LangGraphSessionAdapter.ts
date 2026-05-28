import type { SessionPort } from "../../port/session/SessionPort.js";
import type { SessionKey } from "../../port/session/SessionKey.js";
import fs from "fs/promises";
import path from "path";

export class LangGraphSessionAdapter implements SessionPort {
  constructor(private baseDir: string = "sessions") {}

  async save(key: SessionKey, state: Record<string, unknown>): Promise<void> {
    const dir = path.join(this.baseDir, key.sessionId, key.namespace ?? "default");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
  }

  async load(key: SessionKey): Promise<Record<string, unknown> | null> {
    try {
      const filePath = path.join(this.baseDir, key.sessionId, key.namespace ?? "default", "state.json");
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async delete(key: SessionKey): Promise<void> {
    try {
      await fs.rm(path.join(this.baseDir, key.sessionId), { recursive: true });
    } catch {
      // ignore
    }
  }

  async exists(key: SessionKey): Promise<boolean> {
    try {
      await fs.access(path.join(this.baseDir, key.sessionId, key.namespace ?? "default", "state.json"));
      return true;
    } catch {
      return false;
    }
  }
}
