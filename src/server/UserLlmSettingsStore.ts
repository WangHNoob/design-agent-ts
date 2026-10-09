import { mkdir, readFile, writeFile, unlink, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModelConfig, ReasoningConfig } from "../port/model/ModelConfig.js";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./secretBox.js";
import { resolveProviderBaseUrl } from "../config/modelReasoning.js";

/**
 * BYOK 的按用户模型配置存储：每用户一个 JSON 文件（chmod 600 语义，
 * 目录级隔离），GET 永远不回传 apiKey 明文，只回掩码。带 30s 读缓存，
 * 写入即失效——模型适配器每次调用都经此读取，不能每调用都打盘。
 *
 * apiKey 落盘为 AES-256-GCM 密文（secretBox）；读到历史明文时在内存中
 * 正常使用并异步迁移为密文。
 */
export interface UserLlmConfig {
  /** 内置协议（openai/anthropic/openai-compatible）或注册表 provider id（deepseek/zai/…） */
  provider: string;
  modelName: string;
  baseUrl?: string;
  apiKey: string;
  /** 思考配置（五档 + 可选预算）；缺省视为 off（用厂商默认行为） */
  reasoning?: ReasoningConfig;
  updatedAt: string;
}

const CACHE_TTL_MS = 30_000;

export class UserLlmSettingsStore {
  private dir: string;
  private cache = new Map<string, { value: UserLlmConfig | null; at: number }>();

  constructor(baseDir = ".") {
    this.dir = join(baseDir, "user-llm");
  }

  private fileFor(userId: string): string {
    // userId 来自 Better Auth（字母数字），防御性再约束一次防路径穿越
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
      throw new Error("invalid user id");
    }
    return join(this.dir, `${userId}.json`);
  }

  async get(userId: string): Promise<UserLlmConfig | null> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    let value: UserLlmConfig | null = null;
    try {
      const raw = await readFile(this.fileFor(userId), "utf8");
      const parsed = JSON.parse(raw) as UserLlmConfig;
      if (parsed && parsed.apiKey && parsed.modelName) {
        if (isEncryptedSecret(parsed.apiKey)) {
          const plain = decryptSecret(parsed.apiKey);
          value = plain ? { ...parsed, apiKey: plain } : null;
        } else {
          // 历史明文：内存中正常使用，异步迁移为密文
          value = parsed;
          void this.migratePlaintextKey(userId, parsed);
        }
      }
    } catch {
      value = null;
    }
    this.cache.set(userId, { value, at: Date.now() });
    return value;
  }

  /** 旧明文 Key 迁移为密文；失败不打断读取（下次写盘时自然覆盖）。 */
  private async migratePlaintextKey(userId: string, config: UserLlmConfig): Promise<void> {
    try {
      const file = this.fileFor(userId);
      const encrypted: UserLlmConfig = { ...config, apiKey: encryptSecret(config.apiKey) };
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
    } catch (err) {
      console.warn(`[UserLlmSettings] 明文 Key 加密迁移失败（不影响使用）: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 转模型配置（maxTokens/temperature 沿用全局限制，由调用方补齐；
   *  baseUrl 未填时用注册表 provider 预设）。 */
  async getModelConfig(userId: string): Promise<ModelConfig | null> {
    const cfg = await this.get(userId);
    if (!cfg) return null;
    return {
      provider: cfg.provider,
      modelName: cfg.modelName,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl ?? resolveProviderBaseUrl(cfg.provider) ?? undefined,
      reasoning: cfg.reasoning,
    };
  }

  async set(userId: string, config: Omit<UserLlmConfig, "updatedAt">): Promise<void> {
    const file = this.fileFor(userId);
    await mkdir(dirname(file), { recursive: true });
    const value: UserLlmConfig = {
      ...config,
      apiKey: encryptSecret(config.apiKey),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 });
    this.cache.delete(userId);
  }

  async remove(userId: string): Promise<void> {
    this.cache.delete(userId);
    try {
      await unlink(this.fileFor(userId));
    } catch {
      // 已不存在视为成功
    }
  }

  /** 删除整个目录（测试/运维用）。 */
  async removeAll(): Promise<void> {
    this.cache.clear();
    try {
      await rm(this.dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
