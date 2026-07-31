import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type { AppendAuditInput } from "../../port/audit/types.js";

let auditStore: AuditStorePort | null = null;

/** Composition-root setter for audit append helpers. */
export function setGlobalAuditStore(store: AuditStorePort | null): void {
  auditStore = store;
}

export async function appendAudit(input: AppendAuditInput): Promise<void> {
  if (!auditStore) return;
  try {
    await auditStore.append(input);
  } catch {
    // Audit failures must not break request handling.
  }
}

const loggedSessions = new Set<string>();

/** Log auth.login once per Better Auth session id (approximate, in-process dedup). */
export async function auditLoginOnce(
  userId: string,
  sessionId: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  if (loggedSessions.has(sessionId)) return;
  loggedSessions.add(sessionId);
  await appendAudit({
    userId,
    action: "auth.login",
    resourceType: "session",
    resourceId: sessionId,
    sessionId,
    outcome: "success",
    detail,
  });
}

/** Test helper — reset login dedup state. */
export function resetLoginAuditDedup(): void {
  loggedSessions.clear();
}
