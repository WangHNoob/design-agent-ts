import type { UserPort, User, UserAsset, UserAssetType } from "../../port/user/UserPort.js";
import type { TenantIsolationPort, TenantContext } from "../../port/user/TenantIsolationPort.js";
import type { DatabasePort } from "../../port/infra/DatabasePort.js";

/**
 * Framework-agnostic user context manager.
 *
 * Provides tenant-scoped access to user data and assets.
 * Lives in core/ and depends ONLY on port/ interfaces.
 *
 * This is the central coordination point for user isolation:
 * - All data access goes through this manager
 * - System assets are shared but immutable
 * - User assets are isolated by userId
 */
export class UserContextManager {
  constructor(
    private readonly userPort: UserPort,
    private readonly tenantPort: TenantIsolationPort,
  ) {}

  // ─── Authentication ────────────────────────────────────────────

  /** Resolve a tenant context from an auth token. */
  async resolveContext(token: string): Promise<TenantContext | null> {
    return this.tenantPort.resolveTenant(token);
  }

  /** Authenticate a user by email + password. */
  async authenticate(email: string, password: string) {
    return this.userPort.authenticate(email, password);
  }

  // ─── User CRUD ─────────────────────────────────────────────────

  /** Get a user by ID. */
  async getUser(id: string): Promise<User | null> {
    return this.userPort.getUser(id);
  }

  /** Create a new user. */
  async createUser(params: {
    email: string;
    displayName: string;
    password: string;
    role?: "admin" | "user";
  }) {
    const passwordHash = await this.hashPassword(params.password);
    return this.userPort.createUser({
      email: params.email,
      displayName: params.displayName,
      passwordHash,
      role: params.role,
    });
  }

  // ─── Asset Access ──────────────────────────────────────────────

  /**
   * Get a user's asset, falling back to system asset.
   * This implements the asset resolution chain:
   * 1. Check user's own asset
   * 2. Fall back to system asset (read-only)
   */
  async getAsset<T = Record<string, unknown>>(
    ctx: TenantContext,
    assetType: UserAssetType,
    assetKey: string,
  ): Promise<T | null> {
    // Try user asset first
    const userAsset = await this.userPort.getAsset(assetType, assetKey, ctx.userId);
    if (userAsset) return userAsset.data as T;

    // Fall back to system asset
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
    const { allowed } = await this.tenantPort.checkConcurrencyLimit(ctx.userId, maxConcurrent);
    if (!allowed) return false;
    await this.tenantPort.incrementConcurrency(ctx.userId);
    return true;
  }

  /**
   * Release a concurrency slot for a user.
   */
  async releaseConcurrencySlot(ctx: TenantContext): Promise<void> {
    await this.tenantPort.decrementConcurrency(ctx.userId);
  }

  // ─── Private ───────────────────────────────────────────────────

  private async hashPassword(password: string): Promise<string> {
    // Delegate to the adapter's hashPassword method
    // The UserPort adapter handles the actual hashing
    const { createHmac } = await import("crypto");
    // Use a simple HMAC — the adapter will use its own secret
    // This is a placeholder; the actual hashing happens in PostgresUserAdapter
    return createHmac("sha256", "placeholder").update(password).digest("hex");
  }
}
