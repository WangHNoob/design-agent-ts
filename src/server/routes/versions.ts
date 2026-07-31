import { Hono } from "hono";
import type { VersionStorePort } from "../../port/versioning/VersionStorePort.js";
import type { ArtifactKind, UpsertArtifactVersionInput } from "../../port/versioning/types.js";
import { requireAdmin } from "../middleware/auth.js";

let versionStore: VersionStorePort | null = null;
let defaultCanaryPercent = 0;

export function setVersionStoreDependencies(
  store: VersionStorePort | null,
  options: { defaultCanaryPercent?: number } = {},
): void {
  versionStore = store;
  defaultCanaryPercent = options.defaultCanaryPercent ?? 0;
}

export const versionsRoute = new Hono();

function requireStore() {
  if (!versionStore) {
    throw new Error("Version store is not configured");
  }
  return versionStore;
}

function parseKind(raw: string | undefined): ArtifactKind | null {
  if (raw === "prompt" || raw === "skill" || raw === "workflow") return raw;
  return null;
}

versionsRoute.get("/", async (c) => {
  try {
    const store = requireStore();
    const kind = parseKind(c.req.query("kind") ?? undefined);
    const name = c.req.query("name") ?? undefined;
    if (!kind) {
      return c.json({ error: "validation_error", message: "kind query param required" }, 400);
    }
    const versions = await store.listVersions(kind, name || undefined);
    return c.json({
      versions: versions.map((v) => ({
        id: v.id,
        kind: v.kind,
        name: v.name,
        version: v.version,
        isActive: v.isActive,
        canaryPercent: v.canaryPercent,
        whitelistUserIds: v.whitelistUserIds,
        createdAt: v.createdAt,
        retiredAt: v.retiredAt,
        contentLength: v.content.length,
      })),
    });
  } catch (error) {
    return c.json({
      error: "version_list_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 503);
  }
});

versionsRoute.post("/", requireAdmin(), async (c) => {
  try {
    const store = requireStore();
    const body = await c.req.json<UpsertArtifactVersionInput & { release?: boolean }>();
    if (!body.kind || !body.name || !body.version || !body.content) {
      return c.json({ error: "validation_error", message: "kind, name, version, content required" }, 400);
    }
    const record = await store.upsertVersion({
      kind: body.kind,
      name: body.name,
      version: body.version,
      content: body.content,
      metadata: body.metadata,
      isActive: body.isActive ?? body.release === true,
      canaryPercent: body.canaryPercent ?? (body.release ? defaultCanaryPercent : 0),
      whitelistUserIds: body.whitelistUserIds,
    });
    return c.json({ version: record }, 201);
  } catch (error) {
    return c.json({
      error: "version_upsert_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

versionsRoute.post("/:id/release", requireAdmin(), async (c) => {
  try {
    const store = requireStore();
    const id = c.req.param("id")!;
    const body = await c.req.json<{
      isActive: boolean;
      canaryPercent?: number;
      whitelistUserIds?: string[];
    }>();
    if (body.isActive === undefined) {
      return c.json({ error: "validation_error", message: "isActive required" }, 400);
    }
    const updated = await store.setRelease(id, {
      isActive: body.isActive,
      canaryPercent: body.canaryPercent,
      whitelistUserIds: body.whitelistUserIds,
    });
    return c.json({ version: updated });
  } catch (error) {
    return c.json({
      error: "version_release_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

versionsRoute.post("/rollback", requireAdmin(), async (c) => {
  try {
    const store = requireStore();
    const body = await c.req.json<{ kind: ArtifactKind; name: string; versionId: string }>();
    if (!body.kind || !body.name || !body.versionId) {
      return c.json({ error: "validation_error", message: "kind, name, versionId required" }, 400);
    }
    await store.rollback(body);
    const versions = await store.listVersions(body.kind, body.name);
    return c.json({ versions });
  } catch (error) {
    return c.json({
      error: "version_rollback_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

versionsRoute.get("/:id", async (c) => {
  try {
    const store = requireStore();
    const version = await store.getVersion(c.req.param("id")!);
    if (!version) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ version });
  } catch (error) {
    return c.json({
      error: "version_get_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 503);
  }
});
