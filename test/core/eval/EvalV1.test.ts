import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ExactMatchScorer } from "../../../src/core/eval/ExactMatchScorer.js";
import { LlmJudgeScorer } from "../../../src/core/eval/LlmJudgeScorer.js";
import { EvalRunner } from "../../../src/core/eval/EvalRunner.js";
import { InMemoryEvalStore } from "../../../src/core/eval/InMemoryEvalStore.js";
import { parseEvalDataset } from "../../../src/core/eval/parseEvalDataset.js";
import { formatEvalReportMarkdown } from "../../../src/core/eval/formatEvalReport.js";
import { MockModelAdapter } from "../../../src/adapter/mock/MockModelAdapter.js";
import { MockAgentAdapter } from "../../../src/adapter/mock/MockAgentAdapter.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { AgentResponse } from "../../../src/port/agent/AgentResponse.js";
import type { IdGeneratorPort } from "../../../src/port/infra/IdGeneratorPort.js";
import type { EvalDataset } from "../../../src/port/eval/types.js";

class TestIds implements IdGeneratorPort {
  private n = 0;
  randomUUID(): string {
    this.n += 1;
    return `00000000-0000-4000-8000-${this.n.toString().padStart(12, "0")}`;
  }
}

const tinyDataset: EvalDataset = {
  id: "tiny",
  name: "Tiny",
  version: "1",
  metrics: [
    { id: "struct", name: "Structure", kind: "exact_match", passThreshold: 1 },
    {
      id: "quality",
      name: "Quality",
      kind: "llm_judge",
      criteria: "合理性",
      passThreshold: 0.6,
    },
  ],
  cases: [
    {
      id: "ok",
      input: "设计战斗",
      recordedOutput: "## 目标\n好的方案\n## 核心机制\nx",
      sourceTraceId: "tr-ok",
    },
    {
      id: "bad",
      input: "设计公会",
      recordedOutput: "随便写点",
      sourceTraceId: "tr-bad",
      tags: ["negative"],
    },
  ],
  baselines: [
    {
      caseId: "ok",
      metricId: "struct",
      expectedContains: ["## 目标", "## 核心机制"],
    },
    { caseId: "ok", metricId: "quality", judgeRubric: "应有机制" },
    {
      caseId: "bad",
      metricId: "struct",
      expectedContains: ["## 目标", "## 核心机制"],
    },
    { caseId: "bad", metricId: "quality", judgeRubric: "过短应低分" },
  ],
};

describe("ExactMatchScorer", () => {
  test("passes when all expectedContains present", async () => {
    const scorer = new ExactMatchScorer();
    const result = await scorer.score({
      case: tinyDataset.cases[0]!,
      metric: tinyDataset.metrics[0]!,
      baseline: tinyDataset.baselines[0],
      actualOutput: tinyDataset.cases[0]!.recordedOutput!,
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  test("fails when fragments missing", async () => {
    const scorer = new ExactMatchScorer();
    const result = await scorer.score({
      case: tinyDataset.cases[1]!,
      metric: tinyDataset.metrics[0]!,
      baseline: tinyDataset.baselines[2],
      actualOutput: tinyDataset.cases[1]!.recordedOutput!,
    });
    expect(result.passed).toBe(false);
    expect(result.rationale).toMatch(/missing/);
  });
});

describe("LlmJudgeScorer", () => {
  test("parses JSON judge response", async () => {
    const model = new MockModelAdapter([
      ChatMessage.text(
        "assistant",
        "j",
        '{"score":0.9,"passed":true,"rationale":"清晰"}',
      ),
    ]);
    const scorer = new LlmJudgeScorer(model);
    const result = await scorer.score({
      case: tinyDataset.cases[0]!,
      metric: tinyDataset.metrics[1]!,
      baseline: tinyDataset.baselines[1],
      actualOutput: "详细设计",
    });
    expect(result.score).toBe(0.9);
    expect(result.passed).toBe(true);
    expect(result.rationale).toContain("清晰");
  });
});

describe("EvalRunner offline", () => {
  test("scores fixtures and links traceId", async () => {
    const store = new InMemoryEvalStore();
    const runner = new EvalRunner({
      store,
      scorers: [
        new ExactMatchScorer(),
        new LlmJudgeScorer(
          new MockModelAdapter([
            ChatMessage.text(
              "assistant",
              "j",
              '{"score":0.8,"passed":true,"rationale":"ok"}',
            ),
          ]),
        ),
      ],
      ids: new TestIds(),
    });

    const report = await runner.run({ dataset: tinyDataset, mode: "offline" });
    expect(report.task.mode).toBe("offline");
    expect(report.scores.length).toBe(4);
    expect(report.scores.every((s) => s.traceId?.startsWith("tr-"))).toBe(true);

    const okStruct = report.scores.find((s) => s.caseId === "ok" && s.metricId === "struct");
    const badStruct = report.scores.find((s) => s.caseId === "bad" && s.metricId === "struct");
    expect(okStruct?.passed).toBe(true);
    expect(badStruct?.passed).toBe(false);

    const md = formatEvalReportMarkdown(report);
    expect(md).toContain("Eval Report");
    expect(md).toContain("tr-ok");
  });
});

describe("EvalRunner online", () => {
  test("calls agent then scores with traceId from metadata", async () => {
    const descriptor = {
      name: "EvalAgent",
      systemPrompt: "",
      maxIterations: 3,
      toolNames: [] as string[],
      options: {},
    };
    const agent = new MockAgentAdapter(descriptor, {
      agentName: "EvalAgent",
      message: ChatMessage.text("assistant", "EvalAgent", "## 目标\n## 核心机制\n"),
      metadata: { traceId: "online-trace-1" },
      success: true,
      errorMessage: null,
    } satisfies AgentResponse);

    const dataset: EvalDataset = {
      id: "online-tiny",
      name: "Online",
      version: "1",
      metrics: [{ id: "struct", name: "Structure", kind: "exact_match" }],
      cases: [{ id: "c1", input: "设计一下" }],
      baselines: [
        {
          caseId: "c1",
          metricId: "struct",
          expectedContains: ["## 目标", "## 核心机制"],
        },
      ],
    };

    const runner = new EvalRunner({
      store: new InMemoryEvalStore(),
      scorers: [new ExactMatchScorer()],
      ids: new TestIds(),
      agent,
    });

    const report = await runner.run({ dataset, mode: "online" });
    expect(report.scores).toHaveLength(1);
    expect(report.scores[0]!.passed).toBe(true);
    expect(report.scores[0]!.traceId).toBe("online-trace-1");
  });
});

describe("design-golden.v1 dataset", () => {
  test("parses and offline exact_match gate matches expectations", async () => {
    const path = resolve(process.cwd(), "eval/datasets/design-golden.v1.json");
    const dataset = parseEvalDataset(JSON.parse(readFileSync(path, "utf8")));
    const exactMetrics = dataset.metrics.filter((m) => m.kind === "exact_match");
    // Only fixture cases carry recordedOutput — offline replay is not
    // applicable to the online-only cases.
    const fixtureCases = dataset.cases.filter((c) => c.tags?.includes("offline-fixture"));
    const filtered = {
      ...dataset,
      cases: fixtureCases,
      metrics: exactMetrics,
      baselines: dataset.baselines.filter(
        (b) =>
          exactMetrics.some((m) => m.id === b.metricId) &&
          fixtureCases.some((c) => c.id === b.caseId),
      ),
    };

    const report = await new EvalRunner({
      store: new InMemoryEvalStore(),
      scorers: [new ExactMatchScorer()],
      ids: new TestIds(),
    }).run({ dataset: filtered, mode: "offline" });

    expect(report.summary.total).toBe(3);
    const unexpected = report.scores.filter((s) => {
      if (s.passed) return false;
      const c = dataset.cases.find((x) => x.id === s.caseId);
      return !c?.tags?.includes("negative");
    });
    expect(unexpected).toHaveLength(0);
    const incomplete = report.scores.find((s) => s.caseId === "incomplete-doc");
    expect(incomplete?.passed).toBe(false);
  });
});
