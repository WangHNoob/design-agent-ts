import { describe, expect, test } from "vitest";
import { parseSseBlocks } from "../../frontend/lib/api.js";

describe("parseSseBlocks", () => {
  test("忽略 SSE comment 心跳帧", () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const ids: string[] = [];
    const rest = parseSseBlocks(
      ": heartbeat\n\nid: 1-0\nevent: chunk\ndata: {\"text\":\"hi\"}\n\n",
      (event, data) => events.push({ event, data }),
      (id) => ids.push(id),
    );
    expect(rest).toBe("");
    expect(events).toEqual([{ event: "chunk", data: { text: "hi" } }]);
    expect(ids).toEqual(["1-0"]);
  });

  test("仅 comment 时不回调 onEvent", () => {
    const events: unknown[] = [];
    parseSseBlocks(": heartbeat\n\n: ping\n\n", (event) => events.push(event));
    expect(events).toHaveLength(0);
  });
});
