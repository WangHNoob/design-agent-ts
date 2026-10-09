import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * 用户 BYOK Key 的静态加密（AES-256-GCM）。
 *
 * 密钥来源优先级：
 * 1. env USER_SECRET_KEY（任意长字符串，scrypt 派生 32 字节密钥）
 * 2. 未设置时首次自动生成随机密钥并持久化到 <DATA_DIR>/.user-secret（0600），
 *    并告警建议显式配置——自动生成只防"拖库见明文"，密钥与数据同机时
 *    不防本机 root，跨机迁移/多实例部署必须显式配置 USER_SECRET_KEY。
 *
 * 密文格式：v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 */

const KEY_DERIVE_SALT = "design-agent-ts:user-llm:v1";
const CIPHER_PREFIX = "v1:";

let cachedKey: Buffer | null = null;

export function getUserSecretKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.USER_SECRET_KEY?.trim();
  if (fromEnv) {
    cachedKey = scryptSync(fromEnv, KEY_DERIVE_SALT, 32);
    return cachedKey;
  }
  const dataDir = process.env.DATA_DIR ?? "data";
  const keyFile = path.join(dataDir, ".user-secret");
  let stored: string | null = null;
  try {
    stored = fs.readFileSync(keyFile, "utf8").trim() || null;
  } catch {
    stored = null;
  }
  if (!stored) {
    stored = randomBytes(32).toString("base64url");
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    fs.writeFileSync(keyFile, stored, { mode: 0o600 });
    console.warn(
      `[SecretBox] USER_SECRET_KEY 未设置，已生成随机密钥持久化到 ${keyFile}。`
      + "该密钥用于加密用户 BYOK API Key；跨机迁移或多实例部署请显式配置 USER_SECRET_KEY。",
    );
  }
  cachedKey = scryptSync(stored, KEY_DERIVE_SALT, 32);
  return cachedKey;
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(CIPHER_PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getUserSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${CIPHER_PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

/** 解密失败（密钥轮换/密文损坏）返回 null，调用方按"配置不可用"处理。 */
export function decryptSecret(encoded: string): string | null {
  if (!isEncryptedSecret(encoded)) return null;
  const [, ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", getUserSecretKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
