import { describe, expect, test } from "vitest";
import { hashToolCall, normalizeToolArgs, stableStringify } from "../../../src/core/guard/hash.js";

describe("normalizeToolArgs", () => {
  test("数字字符串折叠为数字（EV-021 回归：\"40\" ≡ 40）", () => {
    expect(normalizeToolArgs({ limit: "40" })).toEqual({ limit: 40 });
    expect(normalizeToolArgs({ limit: "3.14" })).toEqual({ limit: 3.14 });
    expect(normalizeToolArgs({ limit: "-1" })).toEqual({ limit: -1 });
  });

  test("非数字字符串原样保留", () => {
    expect(normalizeToolArgs({ table: "ShopItem" })).toEqual({ table: "ShopItem" });
    expect(normalizeToolArgs({ query: "40级" })).toEqual({ query: "40级" });
  });

  test("嵌套对象与数组递归归一化", () => {
    expect(normalizeToolArgs({ filter: { level: "5" }, ids: ["1", "2", "abc"] })).toEqual({
      filter: { level: 5 },
      ids: [1, 2, "abc"],
    });
  });

  test("空对象与 null/undefined 安全", () => {
    expect(normalizeToolArgs({})).toEqual({});
    expect(hashToolCall("t", undefined)).toBe(hashToolCall("t", {}));
  });
});

describe("hashToolCall 语义等价", () => {
  test("字符串/数字交替传参 hash 相同（循环检测不被打穿）", () => {
    expect(hashToolCall("kb_query_table", { table: "ShopItem", limit: "40" }))
      .toBe(hashToolCall("kb_query_table", { table: "ShopItem", limit: 40 }));
  });

  test("键顺序无关", () => {
    expect(hashToolCall("kb_query_table", { limit: 40, table: "ShopItem" }))
      .toBe(hashToolCall("kb_query_table", { table: "ShopItem", limit: 40 }));
  });

  test("不同参数 hash 不同", () => {
    expect(hashToolCall("kb_query_table", { table: "ShopItem", limit: 40 }))
      .not.toBe(hashToolCall("kb_query_table", { table: "Weapon", limit: 40 }));
  });

  test("stableStringify 保持确定性", () => {
    expect(stableStringify({ b: 1, a: [2, { d: "x", c: "40" }] }))
      .toBe(stableStringify({ a: [2, { c: "40", d: "x" }], b: 1 }));
  });
});
