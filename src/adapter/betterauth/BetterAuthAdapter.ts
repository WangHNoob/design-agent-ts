/**
 * Better Auth adapter — implements UserPort using Better Auth for
 * authentication and session management, with PostgreSQL for asset storage.
 *
 * Key design decisions:
 * - Better Auth handles all auth (register, login, session, cookie)
 * - DingTalk SSO via genericOAuth plugin for company login
 * - Email+password login still available as fallback
 * - This adapter wraps Better Auth's API for session resolution
 * - Asset CRUD uses the shared PostgreSQL connection
 * - Admin role auto-assignment via ADMIN_EMAIL_DOMAINS config
 */

import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { Pool } from "pg";
import type {
  UserPort,
  User,
  UserRole,
  UserAsset,
  UserAssetType,
  AssetOwner,
  UpdateUserParams,
  SessionInfo,
} from "../../port/user/UserPort.js";
import type { DatabasePort } from "../../port/infra/DatabasePort.js";

/** Configuration for BetterAuthAdapter. */
export interface BetterAuthAdapterConfig {
  postgresUrl: string;
  betterAuthSecret: string;
  baseUrl?: string;
  /** Comma-separated email domains that auto-assign admin role. e.g. "company.com,corp.cn" */
  adminEmailDomains?: string;
  /** DingTalk SSO configuration. */
  dingtalk?: {
    clientId: string;
    clientSecret: string;
  };
  /** Whether to allow email+password registration (default: true). */
  allowEmailPassword?: boolean;
  /**
   * Additional origins that Better Auth should trust (beyond baseUrl).
   * Comma-separated, e.g. "http://localhost:3001,https://app.example.com".
   * Include your frontend URL(s) here.
   */
  trustedOrigins?: string;
  /** Session expiry in seconds. Default 7 days. */
  sessionTtlSeconds?: number;
  /** Session refresh window in seconds. Default 1 day. */
  refreshTtlSeconds?: number;
}

/**
 * Better Auth-backed UserPort adapter.
 *
 * Better Auth manages:
 * - User registration & login (via /api/auth/* endpoints)
 * - DingTalk SSO (via genericOAuth plugin)
 * - Session management (cookie-based)
 * - Password hashing (bcrypt)
 *
 * This adapter provides:
 * - Session resolution from request headers (via auth.api.getSession)
 * - User CRUD (delegated to Better Auth's database)
 * - Asset ownership (stored in user_assets table)
 * - Admin role auto-assignment based on email domain
 */
export class BetterAuthAdapter implements UserPort {
  /** The Better Auth instance — mounted on Hono as /api/auth/* */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly auth: any;
  private pool: Pool;
  private adminDomains: Set<string>;

  constructor(config: BetterAuthAdapterConfig, private readonly db: DatabasePort) {
    this.pool = new Pool({ connectionString: config.postgresUrl });

    // Parse admin email domains
    this.adminDomains = new Set<string>();
    if (config.adminEmailDomains) {
      config.adminEmailDomains.split(",").forEach((d) => {
        const trimmed = d.trim().toLowerCase();
        if (trimmed) this.adminDomains.add(trimmed);
      });
    }

    // Build plugins list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins: any[] = [];

    // DingTalk SSO via genericOAuth
    if (config.dingtalk?.clientId && config.dingtalk?.clientSecret) {
      plugins.push(
        genericOAuth({
          config: [
            {
              providerId: "dingtalk",
              clientId: config.dingtalk.clientId,
              clientSecret: config.dingtalk.clientSecret,
              authorizationUrl: "https://login.dingtalk.com/oauth2/auth",
              tokenUrl: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
              userInfoUrl: "https://api.dingtalk.com/v1.0/contact/users/me",
              scopes: ["openid", "corpid"],
              pkce: true,
              // DingTalk uses a non-standard token exchange flow
              getToken: async ({ code, redirectURI, codeVerifier }) => {
                const tokenRes = await fetch("https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    clientId: config.dingtalk!.clientId,
                    clientSecret: config.dingtalk!.clientSecret,
                    code,
                    grantType: "authorization_code",
                    redirectUri: redirectURI,
                    codeVerifier,
                  }),
                });
                const tokenData = await tokenRes.json() as Record<string, unknown>;
                return {
                  accessToken: tokenData.accessToken as string,
                  refreshToken: tokenData.refreshToken as string,
                  expiresIn: tokenData.expireIn as number,
                  tokenType: "Bearer",
                };
              },
              getUserInfo: async (tokens) => {
                const userRes = await fetch("https://api.dingtalk.com/v1.0/contact/users/me", {
                  headers: {
                    "x-acs-dingtalk-access-token": tokens.accessToken!,
                  },
                });
                const userData = await userRes.json() as Record<string, unknown>;

                return {
                  id: (userData.unionId || userData.openId) as string,
                  name: (userData.nick || userData.name || "DingTalk User") as string,
                  email: (userData.email || `${userData.openId}@dingtalk`) as string,
                  image: (userData.avatarUrl || undefined) as string | undefined,
                  emailVerified: !!userData.email,
                };
              },
              mapProfileToUser: (profile) => {
                return {
                  name: profile.name as string,
                  email: profile.email as string,
                  image: profile.image as string | undefined,
                };
              },
            },
          ],
        }),
      );
      console.log("[BetterAuth] DingTalk SSO enabled");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authConfig: any = {
      database: this.pool,
      secret: config.betterAuthSecret,
      baseURL: config.baseUrl,
      trustedOrigins: (() => {
        const origins: string[] = config.trustedOrigins
          ? config.trustedOrigins.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        // Always include the base URL origin (Better Auth requires this)
        try {
          const baseOrigin = new URL(config.baseUrl!).origin;
          if (!origins.includes(baseOrigin)) origins.push(baseOrigin);
        } catch { /* ignore invalid baseUrl */ }
        return origins;
      })(),
      emailAndPassword: {
        enabled: config.allowEmailPassword !== false,
        minPasswordLength: 8,
        requireEmailVerification: false,
      },
      user: {
        additionalFields: {
          role: {
            type: "string",
            defaultValue: "user",
            input: false,
          },
        },
      },
      session: {
        expiresIn: config.sessionTtlSeconds ?? 60 * 60 * 24 * 7, // 7 days
        updateAge: config.refreshTtlSeconds ?? 60 * 60 * 24,      // Refresh every 1 day
      },
      plugins,
      hooks: {
        after: async (context: {
          path: string;
          body?: { email?: string };
          context: { returned?: { user?: { id?: string; email?: string } } };
        }) => {
          if (context.path !== "/sign-up/email" && context.path !== "/oauth2/callback/dingtalk") {
            return {};
          }

          // Auto-assign admin role based on email domain
          const email = context.body?.email || context.context.returned?.user?.email;
          if (email && this.isAdminEmail(email)) {
            const userId = context.context.returned?.user?.id;
            if (userId) {
              try {
                await this.pool.query(
                  `UPDATE "user" SET role = 'admin' WHERE id = $1`,
                  [userId],
                );
                console.log(`[BetterAuth] Auto-assigned admin role to ${email} (domain match)`);
              } catch (err) {
                console.error(`[BetterAuth] Failed to assign admin role to ${email}:`, err);
              }
            }
          }

          // For DingTalk SSO: auto-verify email
          if (context.path === "/oauth2/callback/dingtalk") {
            const userId = context.context.returned?.user?.id;
            if (userId) {
              try {
                await this.pool.query(
                  `UPDATE "user" SET "emailVerified" = true WHERE id = $1 AND "emailVerified" = false`,
                  [userId],
                );
              } catch {
                // Non-critical
              }
            }
          }

          return {};
        },
      },
    };

    this.auth = betterAuth(authConfig);
  }

  /**
   * Check if an email address belongs to a configured admin domain.
   */
  isAdminEmail(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase();
    return domain ? this.adminDomains.has(domain) : false;
  }

  // ─── User CRUD ────────────────────────────────────────────────

  async getUser(id: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, email, name as display_name, role, "is_active", "lastLoginAt" as last_login_at, "createdAt" as created_at, "updatedAt" as updated_at
       FROM "user" WHERE id = $1`,
      { 1: id },
    );
    if (result.rows.length === 0) return null;
    return this.rowToUser(result.rows[0]!);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, email, name as display_name, role, "is_active", "lastLoginAt" as last_login_at, "createdAt" as created_at, "updatedAt" as updated_at
       FROM "user" WHERE email = $1`,
      { 1: email },
    );
    if (result.rows.length === 0) return null;
    return this.rowToUser(result.rows[0]!);
  }

  async updateUser(id: string, params: UpdateUserParams): Promise<User | null> {
    const sets: string[] = [];
    const values: Record<string, unknown> = {};
    let paramIdx = 1;

    if (params.displayName !== undefined) {
      sets.push(`name = $${paramIdx}`);
      values[paramIdx.toString()] = params.displayName;
      paramIdx++;
    }
    if (params.role !== undefined) {
      sets.push(`role = $${paramIdx}`);
      values[paramIdx.toString()] = params.role;
      paramIdx++;
    }
    if (params.isActive !== undefined) {
      sets.push(`"is_active" = $${paramIdx}`);
      values[paramIdx.toString()] = params.isActive;
      paramIdx++;
    }

    if (sets.length === 0) return this.getUser(id);

    values[paramIdx.toString()] = id;
    await this.db.query(
      `UPDATE "user" SET ${sets.join(", ")} WHERE id = $${paramIdx}`,
      values,
    );
    return this.getUser(id);
  }

  async deactivateUser(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE "user" SET "is_active" = false WHERE id = $1`,
      { 1: id },
    );
    return result.rowCount > 0;
  }

  // ─── Session Resolution ───────────────────────────────────────

  async resolveSession(headers: Record<string, string | undefined>): Promise<SessionInfo | null> {
    try {
      const session = await this.auth.api.getSession({
        headers: this.toWebHeaders(headers),
      });

      if (!session) return null;

      const user = session.user;
      const role = (user as Record<string, unknown>).role as UserRole ?? "user";

      return {
        userId: user.id,
        sessionId: session.session.id,
        role,
        expiresAt: session.session.expiresAt.toISOString(),
      };
    } catch {
      return null;
    }
  }

  // ─── Asset Ownership ──────────────────────────────────────────

  async listUserAssets(userId: string, assetType?: UserAssetType): Promise<UserAsset[]> {
    let sql = `SELECT id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at
               FROM user_assets WHERE user_id = $1`;
    const params: Record<string, unknown> = { 1: userId };

    if (assetType) {
      sql += ` AND asset_type = $2`;
      params["2"] = assetType;
    }

    sql += ` UNION ALL
             SELECT id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at
             FROM user_assets WHERE owner = 'system'`;
    if (assetType) {
      sql += ` AND asset_type = $2`;
    }

    const result = await this.db.query(sql, params);
    return result.rows.map((r) => this.rowToAsset(r));
  }

  async getAsset(assetType: UserAssetType, assetKey: string, userId?: string): Promise<UserAsset | null> {
    if (userId) {
      const result = await this.db.query(
        `SELECT id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at
         FROM user_assets WHERE user_id = $1 AND asset_type = $2 AND asset_key = $3`,
        { 1: userId, 2: assetType, 3: assetKey },
      );
      if (result.rows.length > 0) return this.rowToAsset(result.rows[0]!);
    }

    const result = await this.db.query(
      `SELECT id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at
       FROM user_assets WHERE owner = 'system' AND asset_type = $1 AND asset_key = $2`,
      { 1: assetType, 2: assetKey },
    );
    if (result.rows.length > 0) return this.rowToAsset(result.rows[0]!);
    return null;
  }

  async storeAsset(userId: string, assetType: UserAssetType, assetKey: string, data: Record<string, unknown>): Promise<UserAsset> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.query(
      `INSERT INTO user_assets (id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, $6, $7)
       ON CONFLICT (asset_type, asset_key, user_id)
       DO UPDATE SET data = $5, updated_at = $7`,
      { 1: id, 2: userId, 3: assetType, 4: assetKey, 5: JSON.stringify(data), 6: now, 7: now },
    );

    return {
      id,
      userId,
      assetType,
      assetKey,
      data,
      owner: "user",
      isMutable: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async deleteAsset(userId: string, assetType: UserAssetType, assetKey: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM user_assets WHERE user_id = $1 AND asset_type = $2 AND asset_key = $3 AND owner = 'user'`,
      { 1: userId, 2: assetType, 3: assetKey },
    );
    return result.rowCount > 0;
  }

  async hasAccess(userId: string, assetType: UserAssetType, assetKey: string, access: "read" | "write"): Promise<boolean> {
    const systemAsset = await this.getAsset(assetType, assetKey);
    if (systemAsset?.owner === "system") {
      if (access === "read") return true;
      const user = await this.getUser(userId);
      return user?.role === "admin";
    }

    const userAsset = await this.db.query(
      `SELECT user_id FROM user_assets WHERE user_id = $1 AND asset_type = $2 AND asset_key = $3`,
      { 1: userId, 2: assetType, 3: assetKey },
    );
    return userAsset.rows.length > 0;
  }

  // ─── Health ────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  /** Close the underlying pg Pool. */
  async close(): Promise<void> {
    await this.pool.end();
  }

  // ─── Private ───────────────────────────────────────────────────

  private rowToUser(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      displayName: (row.display_name ?? row.name ?? "") as string,
      role: (row.role as UserRole) ?? "user",
      isActive: (row.is_active ?? row.isActive ?? true) as boolean,
      lastLoginAt: (row.last_login_at ?? row.lastLoginAt ?? null) as string | null,
      createdAt: (row.created_at ?? row.createdAt ?? new Date().toISOString()) as string,
      updatedAt: (row.updated_at ?? row.updatedAt ?? new Date().toISOString()) as string,
    };
  }

  private rowToAsset(row: Record<string, unknown>): UserAsset {
    const data = typeof row.data === "string" ? JSON.parse(row.data) : (row.data as Record<string, unknown>);
    return {
      id: row.id as string,
      userId: row.user_id as string | null,
      assetType: row.asset_type as UserAssetType,
      assetKey: row.asset_key as string,
      data,
      owner: (row.owner as AssetOwner) ?? "user",
      isMutable: row.is_mutable as boolean,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  /**
   * Convert a plain record of headers to a Headers object
   * for Better Auth's getSession API.
   */
  private toWebHeaders(headers: Record<string, string | undefined>): Headers {
    const h = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        h.set(key, value);
      }
    }
    return h;
  }
}
