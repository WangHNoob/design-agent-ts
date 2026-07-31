export type ArtifactKind = "prompt" | "skill" | "workflow";

export interface ArtifactVersion {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly version: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly isActive: boolean;
  /** 0–100: share of users (by hash) routed to this version when active. */
  readonly canaryPercent: number;
  readonly whitelistUserIds: readonly string[];
  readonly createdAt: string;
  readonly retiredAt?: string;
}

export interface VersionBinding {
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly versionId: string;
}

/** Immutable artifact bindings pinned at session creation (MVCC). */
export interface VersionSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly bindings: readonly VersionBinding[];
  readonly createdAt: string;
}

export interface UpsertArtifactVersionInput {
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly version: string;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
  readonly isActive?: boolean;
  readonly canaryPercent?: number;
  readonly whitelistUserIds?: readonly string[];
}

export interface ReleaseConfig {
  readonly isActive: boolean;
  readonly canaryPercent?: number;
  readonly whitelistUserIds?: readonly string[];
}

export interface RollbackInput {
  readonly kind: ArtifactKind;
  readonly name: string;
  readonly versionId: string;
}
