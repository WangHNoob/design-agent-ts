import type { UserPort, User, UserAsset, UserAssetType } from "../../port/user/UserPort.js";
import type { TenantIsolationPort, TenantContext } from "../../port/user/TenantIsolationPort.js";

/**
 * Framework-agnostic user context manager.
 *
 * Provides tenant-scoped access to user data and assets.
 * Lives in core/ and depends ONLY on port/ interfaces.
 *
 * Authentication is fully delegated to Better Auth (via UserPort.resolveSession).
 * This manager focuses on:
 * - Resolving tenant context from request headers
 * - User data access (read-only, Better Auth manages writes)
 * - Asset access with proper isolation
 * - Concurrency control
 */
export class UserContextManager {
  constructor(
    private readonly userPort: UserPort,
    private readonly tenantPort: TenantIsolationPort,
  ) {}

  // ─── Tenant Context ───────────────────────────────────────────

  /** Resolve a tenant context from request headers (Better Auth session). */
  async resolveContext(headers: Record<string, string | undefined>): Promise<TenantContext | null> {
    return this.tenantPort.resolveTenantFromHeaders(headers);
  }

  // ─── User CRUD ─────────────────────────────────────────────────

  /** Get a user by ID. */
  async getUser(id: string): Promise<User | null> {
    return this.userPort.getUser(id);
  }

  // ─── Asset Access ──────────────────────────────────────────────

  /**
   * Get a user's asset, falling back to system asset.
   * Resolution chain:
   * 1. Check user's own asset
   * 2. Fall back to system asset (read-only)
   */
  async getAsset<T = Record<string, unknown>>(
    ctx: TenantContext,
    assetType: UserAssetType,
    assetKey: string,
  ): Promise<T | null> {
    const userAsset = await this.userPort.getAsset(assetType, assetKey, ctx.userId);
    if (userAsset) return userAsset.data as T;

    const systemAsset = await this.userPort.getAsset(assetType, assetKey);
    if (systemAsset) return systemAsset.data as T;

    return null;
  }

  /**
   * Store a user's asset. System assets cannot be overwritten by non-admin users.
   */
  async storeAsset(
    ctx: TenantContext,
    assetType: UserAssetType,
    assetKey: string,
    data: Record<string, unknown>,
  ): Promise<UserAsset> {
    const hasAccess = await this.userPort.hasAccess(ctx.userId, assetType, assetKey, "write");
    if (!hasAccess) {
      throw new Error(`User ${ctx.userId} does not have write access to ${assetType}/${assetKey}`);
    }
    return this.userPort.storeAsset(ctx.userId, assetType, assetKey, data);
  }

  /**
   * List all assets available to a user (own + system).
   */
  async listAvailableAssets(
    ctx: TenantContext,
    assetType?: UserAssetType,
  ): Promise<UserAsset[]> {
    return this.userPort.listUserAssets(ctx.userId, assetType);
  }

  // ─── Concurrency Control ───────────────────────────────────────

  /**
   * Check and acquire a concurrency slot for a user.
   * Returns true if the user can proceed, false if at limit.
   */
  async acquireConcurrencySlot(
    ctx: TenantContext,
    maxConcurrent: number,
  ): Promise<boolean> {
    const { acquired } = await this.tenantPort.acquireConcurrencySlot(
      ctx.userId,
      maxConcurrent,
    );
    return acquired;
  }

  /**
   * Release a concurrency slot for a user.
   */
  async releaseConcurrencySlot(ctx: TenantContext): Promise<void> {
    await this.tenantPort.releaseConcurrencySlot(ctx.userId);
  }
}
