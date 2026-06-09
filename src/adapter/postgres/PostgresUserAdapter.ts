import type {
  UserPort,
  User,
  UserRole,
  UserAsset,
  UserAssetType,
  AssetOwner,
  CreateUserParams,
  UpdateUserParams,
  AuthResult,
  TokenPayload,
} from "../../port/user/UserPort.js";
import type { DatabasePort } from "../../port/infra/DatabasePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import crypto from "crypto";

/**
 * PostgreSQL-backed UserPort adapter.
 *
 * Stores users and assets in the `users` and `user_assets` tables.
 * Uses HMAC-SHA256 for password hashing and JWT-like tokens for auth.
 *
 * Token format: base64url(JSON.stringify({ userId, role, iat, exp })).HMAC-SHA256
 */
export class PostgresUserAdapter implements UserPort {
  private readonly jwtSecret: string;

  constructor(
    private readonly db: DatabasePort,
    private readonly idGen: IdGeneratorPort,
    jwtSecret: string,
    private readonly tokenTtlMs: number = 24 * 60 * 60 * 1000, // 24 hours
  ) {
    this.jwtSecret = jwtSecret;
  }

  // ─── CRUD ──────────────────────────────────────────────────────

  async createUser(params: CreateUserParams): Promise<User> {
    const id = this.idGen.randomUUID();
    const now = new Date().toISOString();
    await this.db.query(
      `INSERT INTO users (id, email, display_name, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
      { 1: id, 2: params.email, 3: params.displayName, 4: params.passwordHash, 5: params.role ?? "user", 6: now, 7: now }
    );
    return {
      id,
      email: params.email,
      displayName: params.displayName,
      role: params.role ?? "user",
      isActive: true,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getUser(id: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, email, display_name, role, is_active, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      { 1: id }
    );
    if (result.rows.length === 0) return null;
    return this.rowToUser(result.rows[0]!);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, email, display_name, role, is_active, last_login_at, created_at, updated_at
       FROM users WHERE email = $1`,
      { 1: email }
    );
    if (result.rows.length === 0) return null;
    return this.rowToUser(result.rows[0]!);
  }

  async updateUser(id: string, params: UpdateUserParams): Promise<User | null> {
    const sets: string[] = [];
    const values: Record<string, unknown> = {};
    let paramIdx = 1;

    if (params.displayName !== undefined) {
      sets.push(`display_name = $${paramIdx}`);
      values[paramIdx.toString()] = params.displayName;
      paramIdx++;
    }
    if (params.passwordHash !== undefined) {
      sets.push(`password_hash = $${paramIdx}`);
      values[paramIdx.toString()] = params.passwordHash;
      paramIdx++;
    }
    if (params.role !== undefined) {
      sets.push(`role = $${paramIdx}`);
      values[paramIdx.toString()] = params.role;
      paramIdx++;
    }
    if (params.isActive !== undefined) {
      sets.push(`is_active = $${paramIdx}`);
      values[paramIdx.toString()] = params.isActive;
      paramIdx++;
    }

    if (sets.length === 0) return this.getUser(id);

    values[paramIdx.toString()] = id;
    await this.db.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${paramIdx}`,
      values
    );
    return this.getUser(id);
  }

  async deactivateUser(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE users SET is_active = false WHERE id = $1`,
      { 1: id }
    );
    return result.rowCount > 0;
  }

  // ─── Authentication ────────────────────────────────────────────

  async authenticate(email: string, password: string): Promise<AuthResult | null> {
    const result = await this.db.query(
      `SELECT id, email, display_name, role, is_active, password_hash, last_login_at, created_at, updated_at
       FROM users WHERE email = $1 AND is_active = true`,
      { 1: email }
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    const storedHash = row.password_hash as string;
    const inputHash = this.hashPassword(password);

    if (storedHash !== inputHash) return null;

    const user = this.rowToUser(row);
    const token = this.generateToken(user);

    // Update last login
    await this.db.query(
      `UPDATE users SET last_login_at = $1 WHERE id = $2`,
      { 1: new Date().toISOString(), 2: user.id }
    );

    return {
      user,
      token,
      expiresAt: new Date(Date.now() + this.tokenTtlMs).toISOString(),
    };
  }

  async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      const parts = token.split(".");
      if (parts.length !== 2) return null;

      const payloadJson = Buffer.from(parts[0]!, "base64url").toString("utf-8");
      const signature = parts[1]!;

      // Verify signature
      const expectedSig = this.signPayload(payloadJson);
      if (signature !== expectedSig) return null;

      const payload = JSON.parse(payloadJson) as TokenPayload;

      // Check expiration
      if (payload.exp * 1000 < Date.now()) return null;

      return payload;
    } catch {
      return null;
    }
  }

  async refreshToken(token: string): Promise<AuthResult | null> {
    const payload = await this.verifyToken(token);
    if (!payload) return null;

    const user = await this.getUser(payload.userId);
    if (!user || !user.isActive) return null;

    const newToken = this.generateToken(user);
    return {
      user,
      token: newToken,
      expiresAt: new Date(Date.now() + this.tokenTtlMs).toISOString(),
    };
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

    // Also include system assets
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
    // Try user asset first
    if (userId) {
      const result = await this.db.query(
        `SELECT id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at
         FROM user_assets WHERE user_id = $1 AND asset_type = $2 AND asset_key = $3`,
        { 1: userId, 2: assetType, 3: assetKey }
      );
      if (result.rows.length > 0) return this.rowToAsset(result.rows[0]!);
    }

    // Fall back to system asset
    const result = await this.db.query(
      `SELECT id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at
       FROM user_assets WHERE owner = 'system' AND asset_type = $1 AND asset_key = $2`,
      { 1: assetType, 2: assetKey }
    );
    if (result.rows.length > 0) return this.rowToAsset(result.rows[0]!);
    return null;
  }

  async storeAsset(userId: string, assetType: UserAssetType, assetKey: string, data: Record<string, unknown>): Promise<UserAsset> {
    const id = this.idGen.randomUUID();
    const now = new Date().toISOString();

    await this.db.query(
      `INSERT INTO user_assets (id, user_id, asset_type, asset_key, data, owner, is_mutable, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, $6, $7)
       ON CONFLICT (asset_type, asset_key, user_id)
       DO UPDATE SET data = $5, updated_at = $7`,
      { 1: id, 2: userId, 3: assetType, 4: assetKey, 5: JSON.stringify(data), 6: now, 7: now }
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
      { 1: userId, 2: assetType, 3: assetKey }
    );
    return result.rowCount > 0;
  }

  async hasAccess(userId: string, assetType: UserAssetType, assetKey: string, access: "read" | "write"): Promise<boolean> {
    // System assets are readable by all, writable by admin only
    const systemAsset = await this.getAsset(assetType, assetKey);
    if (systemAsset?.owner === "system") {
      if (access === "read") return true;
      const user = await this.getUser(userId);
      return user?.role === "admin";
    }

    // User assets: owner has full access
    const userAsset = await this.db.query(
      `SELECT user_id FROM user_assets WHERE user_id = $1 AND asset_type = $2 AND asset_key = $3`,
      { 1: userId, 2: assetType, 3: assetKey }
    );
    return userAsset.rows.length > 0;
  }

  // ─── Health ────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  // ─── Private ───────────────────────────────────────────────────

  private rowToUser(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      displayName: row.display_name as string,
      role: row.role as UserRole,
      isActive: row.is_active as boolean,
      lastLoginAt: row.last_login_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
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

  hashPassword(password: string): string {
    return crypto.createHmac("sha256", this.jwtSecret).update(password).digest("hex");
  }

  private generateToken(user: User): string {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + Math.floor(this.tokenTtlMs / 1000);
    const payload: TokenPayload = { userId: user.id, role: user.role, iat, exp };
    const payloadJson = JSON.stringify(payload);
    const signature = this.signPayload(payloadJson);
    return Buffer.from(payloadJson, "utf-8").toString("base64url") + "." + signature;
  }

  private signPayload(payloadJson: string): string {
    return crypto.createHmac("sha256", this.jwtSecret).update(payloadJson).digest("base64url");
  }
}
