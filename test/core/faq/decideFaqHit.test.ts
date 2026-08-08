import { describe, expect, test } from "vitest";
import { decideFaqHit } from "../../../src/core/faq/decideFaqHit.js";

describe("decideFaqHit", () => {
  test("hit when score >= threshold and answer non-empty", () => {
    expect(
      decideFaqHit(
        { hit: true, score: 0.9, answer: "标准答", faqId: "f1", question: "Q" },
        0.85,
      ),
    ).toEqual({
      ok: true,
      score: 0.9,
      answer: "标准答",
      faqId: "f1",
      question: "Q",
    });
  });

  test("miss when score below local threshold even if provider hit", () => {
    expect(
      decideFaqHit({ hit: true, score: 0.7, answer: "x" }, 0.85),
    ).toEqual({ ok: false, reason: "below_threshold" });
  });

  test("miss when answer empty", () => {
    expect(
      decideFaqHit({ hit: true, score: 0.99, answer: "  " }, 0.85),
    ).toEqual({ ok: false, reason: "empty_answer" });
  });

  test("miss when provider hit false", () => {
    expect(
      decideFaqHit({ hit: false, score: 0.99, answer: "x" }, 0.85),
    ).toEqual({ ok: false, reason: "provider_miss" });
  });
});
