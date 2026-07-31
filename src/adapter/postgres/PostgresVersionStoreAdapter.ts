import type { DatabasePort, DbRow } from "../../port/infra/DatabasePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type { VersionStorePort } from "../../port/versioning/VersionStorePort.js";
import type {
  ArtifactKind,
  ArtifactVersion,
  ReleaseConfig,
  RollbackInput,
  UpsertArtifactVersionInput,
  VersionBinding,
  VersionSnapshot,
} from "../../port/versioning/types.js";
import { selectCanaryVersion } from "../../core/versioning/selectCanaryVersion.js";
import { versionContentImmutableError } from "../../core/versioning/versionContentImmutableError.js";

export class PostgresVersionStoreAdapter implements VersionStorePort {
  constructor(
    private readonly db: DatabasePort,
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  async upsertVersion(input: UpsertArtifactVersionInput): Promise<ArtifactVersion> {
    const existing = await this.db.query(
      `SELECT * FROM artifact_versions
       WHERE kind = $1 AND name = $2 AND version = $3`,
      { 1: input.kind, 2: input.name, 3: input.version },
    );

    if (existing.rows[0]) {
      const row = existing.rows[0]!;
      if (String(row.content) !== input.content) {
        throw versionContentImmutableError(input.kind, input.name, input.version);
      }
      await this.db.query(
        `UPDATE artifact_versions SET
           is_active = COALESCE($2, is_active),
           canary_percent = COALESCE($3, canary_percent),
           whitelist_user_ids = COALESCE($4, whitelist_user_ids)
         WHERE id = $1`,
        {
          1: String(row.id),
          2: input.isActive ?? null,
          3: input.canaryPercent ?? null,
          4: input.whitelistUserIds !== undefined
            ? JSON.stringify(input.whitelistUserIds)
            : null,
        },
      );
      return (await this.getVersion(String(row.id)))!;
    }

    const id = this.idGenerator.randomUUID();
    await this.db.query(
      `INSERT INTO artifact_versions (
         id, kind, name, version, content, metadata,
         is_active, canary_percent, whitelist_user_ids, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      {
        1: id,
        2: input.kind,
        3: input.name,
        4: input.version,
        5: input.content,
        6: input.metadata ?? {},
        7: input.isActive ?? false,
        8: input.canaryPercent ?? 0,
        9: JSON.stringify(input.whitelistUserIds ?? []),
      },
    );

    return (await this.getVersion(id))!;
  }

  async listVersions(kind: ArtifactKind, name?: string): Promise<ArtifactVersion[]> {
    const conditions = ["kind = $1"];
    const params: Record<string, unknown> = { 1: kind };
    if (name !== undefined) {
      conditions.push("name = $2");
      params["2"] = name;
    }
    const result = await this.db.query(
      `SELECT * FROM artifact_versions
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map((row) => this.rowToVersion(row));
  }

  async getVersion(id: string): Promise<ArtifactVersion | null> {
    const result = await this.db.query(
      `SELECT * FROM artifact_versions WHERE id = $1`,
      { 1: id },
    );
    if (result.rows.length === 0) return null;
    return this.rowToVersion(result.rows[0]!);
  }

  async setRelease(versionId: string, release: ReleaseConfig): Promise<ArtifactVersion> {
    await this.db.query(
      `UPDATE artifact_versions SET
         is_active = $2,
         canary_percent = COALESCE($3, canary_percent),
         whitelist_user_ids = COALESCE($4, whitelist_user_ids)
       WHERE id = $1`,
      {
        1: versionId,
        2: release.isActive,
        3: release.canaryPercent ?? null,
        4: release.whitelistUserIds ? JSON.stringify(release.whitelistUserIds) : null,
      },
    );
    return (await this.getVersion(versionId))!;
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
    const bindings: VersionBinding[] = [];
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
      id: this.idGenerator.randomUUID(),
      userId,
      bindings,
      createdAt: new Date().toISOString(),
    };
    await this.saveSnapshot(snapshot);
    return snapshot;
  }

  async getSnapshot(snapshotId: string): Promise<VersionSnapshot | null> {
    const result = await this.db.query(
      `SELECT * FROM session_version_snapshots WHERE id = $1`,
      { 1: snapshotId },
    );
    if (result.rows.length === 0) return null;
    return this.rowToSnapshot(result.rows[0]!);
  }

  async saveSnapshot(snapshot: VersionSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO session_version_snapshots (id, user_id, bindings, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      {
        1: snapshot.id,
        2: snapshot.userId,
        3: snapshot.bindings,
        4: snapshot.createdAt,
      },
    );
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
    const result = await this.db.query(
      `SELECT DISTINCT name FROM artifact_versions
       WHERE kind = $1 AND retired_at IS NULL
       ORDER BY name`,
      { 1: kind },
    );
    return result.rows.map((row) => String(row.name));
  }

  private rowToVersion(row: DbRow): ArtifactVersion {
    const whitelist = row.whitelist_user_ids;
    return {
      id: String(row.id),
      kind: row.kind as ArtifactKind,
      name: String(row.name),
      version: String(row.version),
      content: String(row.content),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      isActive: Boolean(row.is_active),
      canaryPercent: Number(row.canary_percent ?? 0),
      whitelistUserIds: Array.isArray(whitelist)
        ? whitelist.map(String)
        : [],
      createdAt: this.toIso(row.created_at),
      retiredAt: row.retired_at ? this.toIso(row.retired_at) : undefined,
    };
  }

  private rowToSnapshot(row: DbRow): VersionSnapshot {
    const bindings = row.bindings;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      bindings: Array.isArray(bindings) ? bindings as VersionBinding[] : [],
      createdAt: this.toIso(row.created_at),
    };
  }

  private toIso(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value));
    return date.toISOString();
  }
}
