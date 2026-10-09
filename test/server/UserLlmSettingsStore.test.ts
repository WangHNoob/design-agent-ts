import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptSecret, isEncryptedSecret, decryptSecret } from "../../src/server/secretBox.js";
import { UserLlmSettingsStore } from "../../src/server/UserLlmSettingsStore.js";

let dir: string;

beforeAll(async () => {
  // 固定测试密钥，避免自动生成落盘 data/.user-secret
  process.env.USER_SECRET_KEY = "test-secret-key-for-vitest";
  dir = await mkdtemp(join(tmpdir(), "user-llm-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("secretBox", () => {
  test("加密往返：密文带 v1 前缀，不含明文", () => {
    const plain = "sk-abc123XYZ";
    const cipher = encryptSecret(plain);
    expect(isEncryptedSecret(cipher)).toBe(true);
    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher)).toBe(plain);
  });

  test("每次加密 iv 不同（非确定性密文）", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  test("密文被篡改/密钥不匹配时解密返回 null 而非抛错", () => {
    const cipher = encryptSecret("payload");
    const parts = cipher.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(decryptSecret(parts.join(":"))).toBeNull();
    expect(decryptSecret("not-a-cipher")).toBeNull();
  });
});

describe("UserLlmSettingsStore（BYOK 加密落盘）", () => {
  test("set 后磁盘上是密文，get 返回明文", async () => {
    const store = new UserLlmSettingsStore(dir);
    await store.set("user_enc", { provider: "deepseek", modelName: "deepseek-v4-flash", apiKey: "sk-live-999" });
    const raw = await readFile(join(dir, "user-llm", "user_enc.json"), "utf8");
    expect(raw).not.toContain("sk-live-999");
    expect(JSON.parse(raw).apiKey.startsWith("v1:")).toBe(true);
    const cfg = await store.get("user_enc");
    expect(cfg?.apiKey).toBe("sk-live-999");
  });

  test("历史明文文件：get 正常解用并自动迁移为密文", async () => {
    const userDir = join(dir, "user-llm");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "user_legacy.json"), JSON.stringify({
      provider: "openai-compatible",
      modelName: "gpt-4o",
      apiKey: "sk-legacy-plain",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }), "utf8");

    const store = new UserLlmSettingsStore(dir);
    const cfg = await store.get("user_legacy");
    expect(cfg?.apiKey).toBe("sk-legacy-plain");
    // 给异步迁移一点时间
    await new Promise((r) => setTimeout(r, 50));
    const raw = await readFile(join(userDir, "user_legacy.json"), "utf8");
    expect(JSON.parse(raw).apiKey.startsWith("v1:")).toBe(true);
  });

  test("getModelConfig：baseUrl 缺省时填充注册表 provider 预设，reasoning 透传", async () => {
    const store = new UserLlmSettingsStore(dir);
    await store.set("user_preset", {
      provider: "zai",
      modelName: "glm-5",
      apiKey: "sk-zai",
      reasoning: { mode: "medium" },
    });
    const modelConfig = await store.getModelConfig("user_preset");
    expect(modelConfig?.provider).toBe("zai");
    expect(modelConfig?.baseUrl).toContain("api.z.ai");
    expect(modelConfig?.reasoning).toEqual({ mode: "medium" });
  });

  test("密文在密钥丢失（解密失败）时按无配置处理而非崩溃", async () => {
    const userDir = join(dir, "user-llm");
    await writeFile(join(userDir, "user_lost.json"), JSON.stringify({
      provider: "openai",
      modelName: "gpt-4o",
      apiKey: "v1:AAAA:BBBB:CCCC",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }), "utf8");
    const store = new UserLlmSettingsStore(dir);
    expect(await store.get("user_lost")).toBeNull();
  });
});
