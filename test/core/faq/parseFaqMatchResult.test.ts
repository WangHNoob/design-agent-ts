import { describe, expect, test } from "vitest";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";
import { parseFaqMatchResult } from "../../../src/core/faq/parseFaqMatchResult.js";

describe("parseFaqMatchResult", () => {
  test("parses JSON string with snake_case faq_id", () => {
    expect(
      parseFaqMatchResult(
        JSON.stringify({
          hit: true,
          score: 0.91,
          answer: "标准答案",
          faq_id: "faq-1",
          question: "怎么充值？",
        }),
      ),
    ).toEqual({
      hit: true,
      score: 0.91,
      answer: "标准答案",
      faqId: "faq-1",
      question: "怎么充值？",
    });
  });

  test("parses plain object with camelCase faqId", () => {
    expect(
      parseFaqMatchResult({
        hit: true,
        score: 0.88,
        answer: "A",
        faqId: "f2",
      }),
    ).toEqual({
      hit: true,
      score: 0.88,
      answer: "A",
      faqId: "f2",
    });
  });

  test("parses ToolResult output JSON", () => {
    expect(
      parseFaqMatchResult(
        ToolResult.success(
          JSON.stringify({ hit: false, score: 0.4, answer: "", faq_id: "x" }),
        ),
      ),
    ).toEqual({
      hit: false,
      score: 0.4,
      answer: "",
      faqId: "x",
    });
  });

  test("tolerates missing optional fields", () => {
    expect(parseFaqMatchResult(JSON.stringify({ hit: true, score: 0.9 }))).toEqual({
      hit: true,
      score: 0.9,
    });
  });

  test("maps project_id to projectId", () => {
    expect(
      parseFaqMatchResult(
        JSON.stringify({ hit: true, score: 0.95, project_id: "proj-1" }),
      ),
    ).toEqual({
      hit: true,
      score: 0.95,
      projectId: "proj-1",
    });
  });

  test("returns null on invalid JSON", () => {
    expect(parseFaqMatchResult("not-json")).toBeNull();
  });

  test("returns null on ToolResult error", () => {
    expect(parseFaqMatchResult(ToolResult.error("tool failed"))).toBeNull();
  });

  test("returns null when hit or score missing", () => {
    expect(parseFaqMatchResult(JSON.stringify({ hit: true }))).toBeNull();
    expect(parseFaqMatchResult(JSON.stringify({ score: 0.9 }))).toBeNull();
  });

  test("returns null for null/undefined input", () => {
    expect(parseFaqMatchResult(null)).toBeNull();
    expect(parseFaqMatchResult(undefined)).toBeNull();
  });
});
