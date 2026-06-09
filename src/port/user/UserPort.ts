/**
 * User port — user identity, authentication, and tenant isolation.
 *
 * This port defines the contract for user management in a multi-tenant system.
 * All user data is isolated by userId (tenant). Adapter implementations may
 * use PostgreSQL, Redis, or any identity provider.
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

/** Parameters for creating a new user. */
export interface CreateUserParams {
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly role?: UserRole;
}

/** Parameters for updating a user. */
export interface UpdateUserParams {
  readonly displayName?: string;
  readonly passwordHash?: string;
  readonly role?: UserRole;
  readonly isActive?: boolean;
}

/** Authentication result. */
export interface AuthResult {
  readonly user: User;
  readonly token: string;
  readonly expiresAt: string;
}

/** Token verification result. */
export interface TokenPayload {
  readonly userId: string;
  readonly role: UserRole;
  readonly iat: number;
  readonly exp: number;
}

/**
 * Port interface for user management and authentication.
 *
 * Implementations must ensure:
 * - Password hashing (never store plaintext)
 * - Token-based auth (JWT or similar)
 * - Tenant isolation (users can only access their own assets)
 */
export interface UserPort {
  // ─── CRUD ──────────────────────────────────────────────────────

  /** Create a new user. */
  createUser(params: CreateUserParams): Promise<User>;

  /** Get a user by ID. */
  getUser(id: string): Promise<User | null>;

  /** Get a user by email. */
  getUserByEmail(email: string): Promise<User | null>;

  /** Update a user. */
  updateUser(id: string, params: UpdateUserParams): Promise<User | null>;

  /** Deactivate (soft-delete) a user. */
  deactivateUser(id: string): Promise<boolean>;

  // ─── Authentication ────────────────────────────────────────────

  /** Authenticate a user by email + password. Returns null on failure. */
  authenticate(email: string, password: string): Promise<AuthResult | null>;

  /** Verify a token and return the payload. Returns null if invalid/expired. */
  verifyToken(token: string): Promise<TokenPayload | null>;

  /** Refresh a token. */
  refreshToken(token: string): Promise<AuthResult | null>;

  // ─── Asset Ownership ──────────────────────────────────────────

  /** List assets owned by a user. */
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
