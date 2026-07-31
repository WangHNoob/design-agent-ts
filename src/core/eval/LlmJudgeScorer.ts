import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";
import type { ScorerPort, ScoreInput, ScoreResult } from "../../port/eval/ScorerPort.js";

const JUDGE_SYSTEM = `你是一个严格的评测裁判（LLM-as-Judge）。根据评分维度与标准，对 Agent 实际输出打分。
必须只输出一个 JSON 对象，不要 Markdown 代码块，格式：
{"score":0.0到1.0的小数,"passed":true或false,"rationale":"简短中文理由"}
评分时先简要推理再给分；不要因为回答冗长就加分。`;

/**
 * LLM-as-Judge scorer. Uses an injected ChatModelPort (composition root decides which model).
 */
export class LlmJudgeScorer implements ScorerPort {
  readonly kind = "llm_judge" as const;

  constructor(private readonly model: ChatModelPort) {}

  async score(input: ScoreInput): Promise<ScoreResult> {
    const threshold = input.metric.passThreshold ?? 0.7;
    const criteria = input.metric.criteria ?? "整体质量与任务完成度";
    const rubric = input.baseline?.judgeRubric ?? "";
    const reference = input.baseline?.expectedOutput
      ? `\n参考答案（非必须逐字一致）:\n${input.baseline.expectedOutput}\n`
      : "";

    const userPrompt = [
      `评分维度: ${input.metric.name} (${input.metric.id})`,
      `评分标准: ${criteria}`,
      rubric ? `用例细则: ${rubric}` : "",
      `用户输入:\n${input.case.input}`,
      reference,
      `实际输出:\n${input.actualOutput}`,
      `及格线: ${threshold}`,
      `请输出 JSON。`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await this.model.generate(
      [
        ChatMessage.text("system", "judge", JUDGE_SYSTEM),
        ChatMessage.text("user", "eval", userPrompt),
      ],
      { temperature: 0 },
    );

    const raw = extractText(response.message);
    const parsed = parseJudgeJson(raw);
    if (!parsed) {
      return {
        score: 0,
        passed: false,
        rationale: `Judge returned unparseable output: ${raw.slice(0, 200)}`,
      };
    }

    const score = clamp01(parsed.score);
    const passed = parsed.passed ?? score >= threshold;
    return {
      score,
      passed,
      rationale: parsed.rationale || "no rationale",
    };
  }
}

function extractText(message: ChatMessage): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

function parseJudgeJson(raw: string): { score: number; passed?: boolean; rationale?: string } | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/\{[\s\S]*\}/);
  const candidate = fenced?.[0] ?? trimmed;
  try {
    const obj = JSON.parse(candidate) as Record<string, unknown>;
    const score = Number(obj.score);
    if (!Number.isFinite(score)) return null;
    return {
      score,
      passed: typeof obj.passed === "boolean" ? obj.passed : undefined,
      rationale: typeof obj.rationale === "string" ? obj.rationale : undefined,
    };
  } catch {
    return null;
  }
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
