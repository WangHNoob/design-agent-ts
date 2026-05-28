import type { SessionKey } from "./SessionKey.js";

export interface SessionPort {
  save(key: SessionKey, state: Record<string, unknown>): Promise<void>;
  load(key: SessionKey): Promise<Record<string, unknown> | null>;
  delete(key: SessionKey): Promise<void>;
  exists(key: SessionKey): Promise<boolean>;
}
