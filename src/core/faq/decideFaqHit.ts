import type { FaqDecision, FaqMatchRaw } from "./types.js";

export function decideFaqHit(
  raw: FaqMatchRaw | null | undefined,
  threshold: number,
): FaqDecision {
  if (!raw || typeof raw.score !== "number" || Number.isNaN(raw.score)) {
    return { ok: false, reason: "invalid" };
  }
  if (!raw.hit) return { ok: false, reason: "provider_miss" };
  if (raw.score < threshold) return { ok: false, reason: "below_threshold" };
  const answer = (raw.answer ?? "").trim();
  if (!answer) return { ok: false, reason: "empty_answer" };
  return {
    ok: true,
    score: raw.score,
    answer,
    faqId: raw.faqId,
    question: raw.question,
  };
}
