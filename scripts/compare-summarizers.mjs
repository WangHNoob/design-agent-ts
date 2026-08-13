#!/usr/bin/env node
/**
 * 记忆摘要器小实验对比（01-P3 护栏）：同一批会话在 heuristic 与 LLM 两种摘要器下
 * 生成归档摘要，输出对照表供人工评估——**实验通过前不得将 MEMORY_SUMMARIZER 切到 llm**。
 *
 * 用法：
 *   node scripts/compare-summarizers.mjs [--samples scripts/summarizer-samples.json]
 *
 * 样本格式（缺省内置 3 条演示；生产请按真实 query 会话扩展至 ≥20 条）：
 *   [{ "id": "case-1", "title": "伤害公式", "messages": [
 *       { "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }
 *   ]}]
 *
 * 输出：每条的 heuristic 摘要（截断）与 LLM 摘要（需 LLM_API_KEY/LLM_PROVIDER/LLM_MODEL，
 * 未配置则标记 skipped，仅输出 heuristic 侧供对照）。
 * 人工评分建议：要点保留率（关键数值/ID 是否完整）、语义保真、长度控制。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SAMPLES = [
  {
    id: "demo-1",
    title: "伤害公式口径",
    messages: [
      { role: "user", content: "我们的伤害公式是攻击力×技能倍率吗？" },
      { role: "assistant", content: "是的，物理伤害 = 攻击力 × 技能倍率 × 防御系数，其中防御系数 = 1000/(1000+防御)。" },
      { role: "user", content: "暴击呢？" },
      { role: "assistant", content: "暴击伤害 = 基础伤害 × (1.5 + 暴伤加成)。" },
    ],
  },
  {
    id: "demo-2",
    title: "掉落闭环",
    messages: [
      { role: "user", content: "材料掉落后去哪？" },
      { role: "assistant", content: "掉落 → 背包 → 合成/锻造/商店兑换，形成经济闭环。" },
      { role: "user", content: "掉落表在哪张表？" },
      { role: "assistant", content: "DropTable.csv，字段：item_id、rate、min_count、max_count。" },
    ],
  },
  {
    id: "demo-3",
    title: "遗留问题",
    messages: [
      { role: "user", content: "公会战时间是几点？" },
      { role: "assistant", content: "暂未定案，待排期（遗留项）。" },
    ],
  },
];

const samplePath = process.argv.find((a) => a.startsWith("--samples="))?.split("=")[1];
const samples = samplePath && existsSync(samplePath)
  ? JSON.parse(readFileSync(resolve(samplePath), "utf8"))
  : DEFAULT_SAMPLES;

const llmConfigured = Boolean(process.env.LLM_API_KEY);

function heuristicSummary(messages) {
  return messages
    .map((m) => `- [${m.role}] ${m.content.replace(/\s+/g, " ").slice(0, 200)}`)
    .join("\n")
    .slice(0, 2000);
}

async function llmSummary(messages) {
  // 走项目自身运行时太重；此处直连 OpenAI 兼容接口做离线实验（与 bootstrap 的
  // LLMSummarizerAdapter 提示词一致，验证提示词质量即可迁移）。
  const base = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? "gpt-4.1-mini",
      messages: [
        { role: "system", content: "你是对话记忆摘要器。输出：## 要点 / ## 决策 / ## 遗留项。保留关键数值、ID 与口径。" },
        { role: "user", content: `请摘要以下对话：\n${messages.map((m) => `- [${m.role}] ${m.content}`).join("\n")}` },
      ],
      max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

let skipped = 0;
for (const sample of samples) {
  console.log(`\n===== ${sample.id} · ${sample.title} =====`);
  console.log("--- heuristic（截断） ---");
  console.log(heuristicSummary(sample.messages));
  if (llmConfigured) {
    try {
      console.log("--- llm ---");
      console.log(await llmSummary(sample.messages));
    } catch (err) {
      skipped += 1;
      console.log(`(llm 失败: ${err instanceof Error ? err.message : String(err)})`);
    }
  } else {
    skipped += 1;
    console.log("(llm skipped: 未配置 LLM_API_KEY)");
  }
}

console.log(`\n完成：${samples.length} 条样本，llm skipped ${skipped} 条。`);
console.log("评估要点：要点保留率（关键数值/ID 完整）、语义保真、长度控制。通过后再切 MEMORY_SUMMARIZER=llm。");
