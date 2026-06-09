/**
 * User port — user identity, session management, and asset ownership.
 *
 * This port defines the contract for user management in a multi-tenant system.
 * Authentication is delegated to Better Auth; this port focuses on
 * user data, session resolution, and asset access control.
 */

/** A registered user. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastLoginAt: string | null;
  readonly isActive: boolean;
}

/** User role determines asset access scope. */
export type UserRole = "admin" | "user";

/** Asset ownership type — distinguishes user-private from system-shared assets. */
export type AssetOwner = "system" | "user";

/**
 * An asset that belongs to either a user or the system.
 * System assets are immutable (read-only for non-admin users).
 */
export interface UserAsset {
  readonly id: string;
  readonly userId: string | null; // null = system asset
  readonly assetType: UserAssetType;
  readonly assetKey: string;
  readonly data: Record<string, unknown>;
  readonly owner: AssetOwner;
  readonly isMutable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Types of assets that can be owned by users or the system. */
export type UserAssetType =
  | "llm_config"       // LLM provider/model/apiKey/baseUrl
  | "web_search"       // Tavily API key, enabled flag
  | "skill"            // User-created skill (SKILL.md)
  | "workflow"         // User-created workflow
  | "long_term_memory" // User's long-term memory entries
  | "session"          // User's session history
  | "settings"         // User-level settings overrides
  | "knowledge_base";  // System knowledge base (immutable)

/** Parameters for updating a user. */
export interface UpdateUserParams {
  readonly displayName?: string;
  readonly role?: UserRole;
  readonly isActive?: boolean;
}

/** Session info resolved from Better Auth. */
export interface SessionInfo {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: UserRole;
  readonly expiresAt: string;
}

/**
 * Port interface for user management and session resolution.
 *
 * Implementations must ensure:
 * - Session validation is delegated to Better Auth
 * - Tenant isolation (users can only access their own assets)
 * - System assets are shared but immutable for non-admin users
 */
export interface UserPort {
  // ─── User CRUD ────────────────────────────────────────────────

  /** Get a user by ID. */
  getUser(id: string): Promise<User | null>;

  /** Get a user by email. */
  getUserByEmail(email: string): Promise<User | null>;

  /** Update a user. */
  updateUser(id: string, params: UpdateUserParams): Promise<User | null>;

  /** Deactivate (soft-delete) a user. */
  deactivateUser(id: string): Promise<boolean>;

  // ─── Session Resolution ───────────────────────────────────────

  /**
   * Resolve a session from request headers.
   * Delegates to Better Auth for session validation.
   * Returns null if no valid session found.
   */
  resolveSession(headers: Record<string, string | undefined>): Promise<SessionInfo | null>;

  // ─── Asset Ownership ──────────────────────────────────────────

  /** List assets owned by a user (includes system assets). */
  listUserAssets(userId: string, assetType?: UserAssetType): Promise<UserAsset[]>;

  /** Get a specific asset. System assets are accessible to all users (read-only). */
  getAsset(assetType: UserAssetType, assetKey: string, userId?: string): Promise<UserAsset | null>;

  /** Store a user asset. System assets cannot be stored by non-admin users. */
  storeAsset(userId: string, assetType: UserAssetType, assetKey: string, data: Record<string, unknown>): Promise<UserAsset>;

  /** Delete a user asset. System assets cannot be deleted. */
  deleteAsset(userId: string, assetType: UserAssetType, assetKey: string): Promise<boolean>;

  /** Check if a user has access to an asset. */
  hasAccess(userId: string, assetType: UserAssetType, assetKey: string, access: "read" | "write"): Promise<boolean>;

  // ─── Health ────────────────────────────────────────────────────

  healthCheck(): Promise<boolean>;
}
