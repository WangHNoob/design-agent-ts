import { beforeEach, describe, expect, test, vi } from "vitest";
import { executeDesign, executeDesignStream, listSessions } from "../../frontend/lib/api.js";

function mockJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("frontend API credentials", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(mockJsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
  });

  test("includes cookies on authenticated GET requests", async () => {
    await listSessions();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/sessions"), {
      credentials: "include",
    });
  });

  test("includes cookies on authenticated JSON POST requests", async () => {
    await executeDesign({ requirement: "设计一个战斗系统", mode: "design" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/console/execute"),
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  test("includes cookies on streaming execution requests", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    executeDesignStream({ requirement: "查询规则", mode: "query" }, () => {});

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/console/execute/stream"),
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});
