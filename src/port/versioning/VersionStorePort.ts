import type {
  ArtifactKind,
  ArtifactVersion,
  ReleaseConfig,
  RollbackInput,
  UpsertArtifactVersionInput,
  VersionSnapshot,
} from "./types.js";

export interface VersionStorePort {
  upsertVersion(input: UpsertArtifactVersionInput): Promise<ArtifactVersion>;
  listVersions(kind: ArtifactKind, name?: string): Promise<ArtifactVersion[]>;
  getVersion(id: string): Promise<ArtifactVersion | null>;
  setRelease(versionId: string, release: ReleaseConfig): Promise<ArtifactVersion>;
  resolveForUser(kind: ArtifactKind, name: string, userId: string): Promise<ArtifactVersion | null>;
  bindSnapshot(userId: string): Promise<VersionSnapshot>;
  getSnapshot(snapshotId: string): Promise<VersionSnapshot | null>;
  saveSnapshot(snapshot: VersionSnapshot): Promise<void>;
  rollback(input: RollbackInput): Promise<void>;
  /** Names of artifacts registered for a kind (non-retired). */
  listArtifactNames(kind: ArtifactKind): Promise<string[]>;
}
