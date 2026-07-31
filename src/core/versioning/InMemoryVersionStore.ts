import type { VersionStorePort } from "../../port/versioning/VersionStorePort.js";
import type {
  ArtifactKind,
  ArtifactVersion,
  ReleaseConfig,
  RollbackInput,
  UpsertArtifactVersionInput,
  VersionSnapshot,
} from "../../port/versioning/types.js";
import { selectCanaryVersion } from "./selectCanaryVersion.js";
import { versionContentImmutableError } from "./versionContentImmutableError.js";

export interface InMemoryVersionStoreOptions {
  readonly now?: () => Date;
  readonly idGenerator?: () => string;
}

/**
 * In-memory VersionStore for tests and local dev without Postgres.
 */
export class InMemoryVersionStore implements VersionStorePort {
  private readonly versions = new Map<string, ArtifactVersion>();
  private readonly snapshots = new Map<string, VersionSnapshot>();
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: InMemoryVersionStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  async upsertVersion(input: UpsertArtifactVersionInput): Promise<ArtifactVersion> {
    const existing = [...this.versions.values()].find(
      (v) => v.kind === input.kind && v.name === input.name && v.version === input.version,
    );
    if (existing) {
      if (existing.content !== input.content) {
        throw versionContentImmutableError(input.kind, input.name, input.version);
      }
      const updated: ArtifactVersion = {
        ...existing,
        isActive: input.isActive ?? existing.isActive,
        canaryPercent: input.canaryPercent ?? existing.canaryPercent,
        whitelistUserIds: input.whitelistUserIds ?? existing.whitelistUserIds,
      };
      this.versions.set(updated.id, updated);
      return updated;
    }
    const record: ArtifactVersion = {
      id: this.idGenerator(),
      kind: input.kind,
      name: input.name,
      version: input.version,
      content: input.content,
      metadata: input.metadata ?? {},
      isActive: input.isActive ?? false,
      canaryPercent: input.canaryPercent ?? 0,
      whitelistUserIds: input.whitelistUserIds ?? [],
      createdAt: this.now().toISOString(),
    };
    this.versions.set(record.id, record);
    return record;
  }

  async listVersions(kind: ArtifactKind, name?: string): Promise<ArtifactVersion[]> {
    return [...this.versions.values()]
      .filter((v) => v.kind === kind && (name === undefined || v.name === name))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getVersion(id: string): Promise<ArtifactVersion | null> {
    return this.versions.get(id) ?? null;
  }

  async setRelease(versionId: string, release: ReleaseConfig): Promise<ArtifactVersion> {
    const current = this.versions.get(versionId);
    if (!current) {
      throw new Error(`Version ${versionId} not found`);
    }
    const updated: ArtifactVersion = {
      ...current,
      isActive: release.isActive,
      canaryPercent: release.canaryPercent ?? current.canaryPercent,
      whitelistUserIds: release.whitelistUserIds ?? current.whitelistUserIds,
    };
    this.versions.set(versionId, updated);
    return updated;
  }

  async resolveForUser(
    kind: ArtifactKind,
    name: string,
    userId: string,
  ): Promise<ArtifactVersion | null> {
    const candidates = await this.listVersions(kind, name);
    return selectCanaryVersion(candidates, userId, name);
  }

  async bindSnapshot(userId: string): Promise<VersionSnapshot> {
    const bindings: Array<VersionSnapshot["bindings"][number]> = [];
    for (const kind of ["prompt", "skill", "workflow"] as const) {
      const names = await this.listArtifactNames(kind);
      for (const name of names) {
        const version = await this.resolveForUser(kind, name, userId);
        if (version) {
          bindings.push({ kind, name, versionId: version.id });
        }
      }
    }
    const snapshot: VersionSnapshot = {
      id: this.idGenerator(),
      userId,
      bindings,
      createdAt: this.now().toISOString(),
    };
    await this.saveSnapshot(snapshot);
    return snapshot;
  }

  async getSnapshot(snapshotId: string): Promise<VersionSnapshot | null> {
    return this.snapshots.get(snapshotId) ?? null;
  }

  async saveSnapshot(snapshot: VersionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
  }

  async rollback(input: RollbackInput): Promise<void> {
    const all = await this.listVersions(input.kind, input.name);
    for (const v of all) {
      if (v.id === input.versionId) {
        await this.setRelease(v.id, {
          isActive: true,
          canaryPercent: 0,
          whitelistUserIds: [],
        });
      } else if (v.isActive) {
        await this.setRelease(v.id, { isActive: false, canaryPercent: 0 });
      }
    }
  }

  async listArtifactNames(kind: ArtifactKind): Promise<string[]> {
    const names = new Set<string>();
    for (const v of this.versions.values()) {
      if (v.kind === kind && !v.retiredAt) {
        names.add(v.name);
      }
    }
    return [...names].sort();
  }

  /** Soft-delete: mark retired without removing content. */
  async retireVersion(versionId: string): Promise<void> {
    const v = this.versions.get(versionId);
    if (!v) return;
    this.versions.set(versionId, {
      ...v,
      isActive: false,
      retiredAt: this.now().toISOString(),
    });
  }
}
