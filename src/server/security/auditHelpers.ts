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

// Bounded in-process login-dedup state: sessionId -> first-seen timestamp.
// Sessions older than the TTL are treated as expired, and the map is capped so
// heavy session churn cannot grow it without bound.
const LOGIN_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_DEDUP_MAX_ENTRIES = 10_000;
const loggedSessions = new Map<string, number>();

/** Log auth.login once per Better Auth session id (approximate, in-process dedup). */
export async function auditLoginOnce(
  userId: string,
  sessionId: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const now = Date.now();

  // Lazy eviction: drop expired entries first, then oldest entries if still over cap.
  if (loggedSessions.size >= LOGIN_DEDUP_MAX_ENTRIES) {
    for (const [sid, ts] of loggedSessions) {
      if (now - ts > LOGIN_DEDUP_TTL_MS) loggedSessions.delete(sid);
    }
  }
  if (loggedSessions.size >= LOGIN_DEDUP_MAX_ENTRIES) {
    const oldest = [...loggedSessions.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.ceil(loggedSessions.size / 2));
    for (const [sid] of oldest) loggedSessions.delete(sid);
  }

  if (loggedSessions.has(sessionId)) return;
  loggedSessions.set(sessionId, now);
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
