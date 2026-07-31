import type { AppendAuditInput, AuditEntry, AuditListOptions } from "./types.js";

export interface AuditStorePort {
  append(input: AppendAuditInput): Promise<AuditEntry>;
  listByUser(userId: string, options?: AuditListOptions): Promise<AuditEntry[]>;
}
