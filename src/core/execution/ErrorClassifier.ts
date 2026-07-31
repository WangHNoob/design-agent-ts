import type { ExecutionErrorClass } from "../../port/execution/types.js";

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429]);
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "EPIPE",
]);

type ErrorLike = {
  errorClass?: unknown;
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  cause?: unknown;
  response?: { status?: unknown };
};

export class ErrorClassifier {
  static classify(error: unknown): ExecutionErrorClass {
    const chain = this.errorChain(error);
    const explicit = chain
      .map((item) => item.errorClass)
      .find((value): value is ExecutionErrorClass =>
        ["transient", "permanent", "cancelled", "timeout"].includes(String(value)));
    if (explicit) return explicit;

    if (chain.some((item) => this.isCancelled(item))) {
      return "cancelled";
    }
    if (chain.some((item) => this.isTimeout(item))) {
      return "timeout";
    }
    if (chain.some((item) => this.isTransient(item))) {
      return "transient";
    }
    return "permanent";
  }

  static message(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown execution error";
  }

  private static errorChain(error: unknown): ErrorLike[] {
    const result: ErrorLike[] = [];
    const seen = new Set<unknown>();
    let current: unknown = error;

    while (current && (typeof current === "object" || typeof current === "function") && !seen.has(current)) {
      seen.add(current);
      const item = current as ErrorLike;
      result.push(item);
      current = item.cause;
    }

    if (result.length === 0 && typeof error === "string") {
      result.push({ message: error });
    }
    return result;
  }

  private static isCancelled(error: ErrorLike): boolean {
    const name = this.stringValue(error.name).toLowerCase();
    const code = this.stringValue(error.code).toUpperCase();
    const message = this.stringValue(error.message);
    return name === "aborterror"
      || code === "ABORT_ERR"
      || /\b(cancelled|canceled|aborted)\b|取消|中止/i.test(message);
  }

  private static isTimeout(error: ErrorLike): boolean {
    const name = this.stringValue(error.name).toLowerCase();
    const message = this.stringValue(error.message);
    return name === "timeouterror"
      || name.endsWith("timeouterror")
      || /\b(timed?\s*out|timeout)\b|超时/i.test(message);
  }

  private static isTransient(error: ErrorLike): boolean {
    const status = this.statusValue(error);
    if (
      status !== undefined
      && (TRANSIENT_STATUS_CODES.has(status) || (status >= 500 && status <= 599))
    ) {
      return true;
    }

    const code = this.stringValue(error.code).toUpperCase();
    return TRANSIENT_ERROR_CODES.has(code);
  }

  private static statusValue(error: ErrorLike): number | undefined {
    const raw = error.status ?? error.statusCode ?? error.response?.status;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && /^\d{3}$/.test(raw)) {
      return Number(raw);
    }
    return undefined;
  }

  private static stringValue(value: unknown): string {
    return typeof value === "string" ? value : "";
  }
}
