import type { ArtifactVersion } from "../../port/versioning/types.js";

/** Stable 0–99 bucket from userId + artifact name. */
export function hashToPercent(userId: string, artifactName: string): number {
  const input = `${userId}:${artifactName}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

/**
 * Pick the active version for a user:
 * 1. whitelist match (any active version listing the user)
 * 2. canary hash (newest active canary with canaryPercent > 0)
 * 3. stable active (isActive && canaryPercent === 0, newest first)
 */
export function selectCanaryVersion(
  candidates: readonly ArtifactVersion[],
  userId: string,
  artifactName: string,
): ArtifactVersion | null {
  const active = candidates.filter((v) => v.isActive && !v.retiredAt);
  if (active.length === 0) return null;

  for (const v of active) {
    if (v.whitelistUserIds.includes(userId)) {
      return v;
    }
  }

  const canaryCandidates = [...active]
    .filter((v) => v.canaryPercent > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const bucket = hashToPercent(userId, artifactName);
  for (const v of canaryCandidates) {
    if (bucket < v.canaryPercent) {
      return v;
    }
  }

  const stable = [...active]
    .filter((v) => v.canaryPercent === 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (stable[0]) {
    return stable[0];
  }

  // No stable (canaryPercent===0): fallback to newest active rather than null.
  const fallback = [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return fallback[0] ?? null;
}
