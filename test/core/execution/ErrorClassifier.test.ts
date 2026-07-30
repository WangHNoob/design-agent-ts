import { describe, expect, test } from "vitest";
import { ErrorClassifier } from "../../../src/core/execution/ErrorClassifier.js";

describe("ErrorClassifier", () => {
  test("classifies aborts and explicit cancellation", () => {
    expect(ErrorClassifier.classify(new DOMException("aborted", "AbortError"))).toBe("cancelled");
    expect(ErrorClassifier.classify(new Error("request cancelled by user"))).toBe("cancelled");
  });

  test("classifies timeout errors without binding to an SDK", () => {
    const error = new Error("operation exceeded its timeout");
    error.name = "TimeoutError";
    expect(ErrorClassifier.classify(error)).toBe("timeout");
    expect(ErrorClassifier.classify(new Error("任务执行超时"))).toBe("timeout");
  });

  test("classifies retryable HTTP and network failures as transient", () => {
    expect(ErrorClassifier.classify({ status: 429, message: "rate limited" })).toBe("transient");
    expect(ErrorClassifier.classify({ response: { status: 503 } })).toBe("transient");
    expect(ErrorClassifier.classify({ code: "ECONNRESET" })).toBe("transient");
  });

  test("classifies validation and other client failures as permanent", () => {
    expect(ErrorClassifier.classify({ name: "ValidationError", message: "invalid input" }))
      .toBe("permanent");
    expect(ErrorClassifier.classify({ statusCode: 422, message: "unprocessable" }))
      .toBe("permanent");
  });

  test("examines wrapped causes", () => {
    expect(ErrorClassifier.classify(new Error("wrapped", {
      cause: { status: 408, message: "request expired" },
    }))).toBe("transient");
  });
});
