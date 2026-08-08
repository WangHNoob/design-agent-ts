/**
 * In-process FAQ hit/miss probe against compiled DirectorAgent (same code path as HTTP).
 */
import { DirectorAgent } from "../dist/core/agent/director/DirectorAgent.js";
import { ChatMessage } from "../dist/port/message/ChatMessage.js";

function createStubFactory() {
  let createCount = 0;
  return {
    createCount: () => createCount,
    factory: {
      createAgent: async () => {
        createCount += 1;
        return {
          getDescriptor: () => ({ name: "QueryAgent" }),
          getName: () => "QueryAgent",
          process: async () => ({
            agentName: "QueryAgent",
            message: ChatMessage.text("assistant", "QueryAgent", "LLM fallback"),
            metadata: {},
            success: true,
            errorMessage: null,
          }),
          processStream: async function* () {
            yield {
              agentName: "QueryAgent",
              message: ChatMessage.text("assistant", "QueryAgent", "LLM fallback"),
              metadata: {},
              success: true,
              errorMessage: null,
            };
          },
        };
      },
    },
  };
}

async function runCase(name, faqFastPath) {
  const stub = createStubFactory();
  const director = new DirectorAgent({
    model: {
      getModelName: () => "stub",
      chat: async () => ({ content: "", usage: null }),
      stream: async function* () {},
    },
    agentFactory: stub.factory,
    toolRegistry: {
      register: () => {},
      getToolDescriptors: () => [],
      getTool: () => null,
      executeTool: async () => ({ success: false }),
    },
    skillRegistry: {
      getSkill: () => null,
      listSkills: () => [],
      matchSkill: () => null,
    },
    humanReviewGateway: {
      requestReview: async () => ({ approved: true, fallback: true }),
    },
    hooks: [],
    faqFastPath,
    streamingEnabled: true,
  });

  const t0 = Date.now();
  const events = [];
  for await (const ev of director.executeStream("什么是冷却？", "faq-probe", "query", "chief_designer")) {
    events.push({ at: Date.now() - t0, type: ev.type, data: ev.data });
  }
  return {
    name,
    createAgentCalls: stub.createCount(),
    durationMs: Date.now() - t0,
    types: events.map((e) => e.type),
    faqHit: events.find((e) => e.type === "faq_hit")?.data ?? null,
    complete: events.find((e) => e.type === "complete")?.data ?? null,
    chunks: events.filter((e) => e.type === "chunk").map((e) => e.data?.text),
  };
}

const hit = await runCase("faq-hit", {
  enabled: true,
  threshold: 0.82,
  match: async () => ({
    hit: true,
    score: 0.95,
    answer: "冷却是技能再次可用前的等待时间。",
    faqId: "faq-cd-1",
    question: "什么是冷却？",
  }),
});

const miss = await runCase("faq-miss-below-threshold", {
  enabled: true,
  threshold: 0.82,
  match: async () => ({ hit: true, score: 0.5, answer: "低分不应命中" }),
});

const unavailable = await runCase("faq-tool-null", {
  enabled: true,
  threshold: 0.82,
  match: async () => null,
});

console.log(JSON.stringify({ hit, miss, unavailable }, null, 2));
