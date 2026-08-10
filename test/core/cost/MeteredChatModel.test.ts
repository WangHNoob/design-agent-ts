import { describe, expect, test } from "vitest";
import { MeteredChatModel } from "../../../src/core/cost/MeteredChatModel.js";
import { RateLimitError } from "../../../src/core/cost/RateLimitError.js";
import { InMemoryCostStore } from "../../../src/core/cost/InMemoryCostStore.js";
import { InMemorySlidingWindowLimiter } from "../../../src/core/cost/InMemorySlidingWindowLimiter.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort.js";
import type { ModelConfig } from "../../../src/port/model/ModelConfig.js";
import type { ModelOptions } from "../../../src/port/model/ModelOptions.js";
import type { ModelResponse } from "../../../src/port/model/ModelResponse.js";
import type { IdGeneratorPort } from "../../../src/port/infra/IdGeneratorPort.js";

class FakeIds implements IdGeneratorPort {
  private n = 0;
  randomUUID(): string {
    this.n += 1;
    return `id-${this.n}`;
  }
}

class StubModel implements ChatModelPort {
  constructor(private readonly response: ModelResponse) {}

  async generate(
    _messages: ChatMessage[],
    _options?: ModelOptions,
    _signal?: AbortSignal,
  ): Promise<ModelResponse> {
    return this.response;
  }

  async *stream(): AsyncIterable<ModelResponse> {
    yield this.response;
  }

  getModelName(): string {
    return "gpt-4o";
  }

  getProvider(): string {
    return "openai";
  }

  reconfigure(_config: ModelConfig): void {}
}

describe("MeteredChatModel", () => {
  test("records usage and consumes TPM for Director calls", async () => {
    const store = new InMemoryCostStore(new FakeIds());
    const limiter = new InMemorySlidingWindowLimiter({
      rpmLimitPerUser: 0,
      tpmLimitPerUser: 10_000,
      globalRpmLimit: 0,
      globalTpmLimit: 0,
      windowMs: 60_000,
    });
    const baseResponse: ModelResponse = {
      message: ChatMessage.text("assistant", "", "ok"),
      inputTokenCount: 100,
      outputTokenCount: 50,
      finishReason: "stop",
    };
    const metered = new MeteredChatModel(new StubModel(baseResponse), {
      costEnabled: true,
      rateLimitEnabled: true,
      tpmEstimatePerCall: 100,
      rateLimit: limiter,
      costStore: store,
      resolveUserId: () => "u1",
      defaultAgentName: "Director",
    });

    await metered.generate([ChatMessage.text("user", "", "hi")]);

    expect(store.all()).toHaveLength(1);
    expect(store.all()[0]!.agentName).toBe("Director");
    const remaining = await limiter.getRemaining("u1");
    expect(remaining.tpm).toBe(10_000 - 150);
  });

  test("throws RateLimitError when backend fails (fail-closed)", async () => {
    const metered = new MeteredChatModel(
      new StubModel({
        message: ChatMessage.text("assistant", "", "ok"),
        inputTokenCount: 0,
        outputTokenCount: 0,
        finishReason: "stop",
      }),
      {
        costEnabled: false,
        rateLimitEnabled: true,
        tpmEstimatePerCall: 100,
        rateLimit: {
          checkAndConsume: async () => {
            throw new Error("Redis down");
          },
          getRemaining: async () => ({}),
        },
        costStore: new InMemoryCostStore(new FakeIds()),
        resolveUserId: () => "u1",
      },
    );

    await expect(metered.generate([ChatMessage.text("user", "", "hi")])).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  test("rejects when TPM quota exhausted before call", async () => {
    const limiter = new InMemorySlidingWindowLimiter({
      rpmLimitPerUser: 0,
      tpmLimitPerUser: 100,
      globalRpmLimit: 0,
      globalTpmLimit: 0,
      windowMs: 60_000,
    });
    await limiter.checkAndConsume({ userId: "u1", tpmDelta: 100 });

    const metered = new MeteredChatModel(
      new StubModel({
        message: ChatMessage.text("assistant", "", "ok"),
        inputTokenCount: 0,
        outputTokenCount: 0,
        finishReason: "stop",
      }),
      {
        costEnabled: false,
        rateLimitEnabled: true,
        tpmEstimatePerCall: 50,
        rateLimit: limiter,
        costStore: new InMemoryCostStore(new FakeIds()),
        resolveUserId: () => "u1",
      },
    );

    await expect(metered.generate([ChatMessage.text("user", "", "hi")])).rejects.toMatchObject({
      code: "RATE_LIMIT_TPM",
    });
  });
});
