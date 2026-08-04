/**
 * Default LoggerPort implementation backed by console.*.
 *
 * Lives in core (implementing a port is allowed in core) so that every core
 * class can default to it without touching the adapter layer. The composition
 * root may inject a different logger (trace-aware, remote sink, …) instead.
 */
import type { LoggerPort } from "../../port/infra/LoggerPort.js";

export class ConsoleLogger implements LoggerPort {
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(message, meta ?? "");
  }
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(message, meta ?? "");
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(message, meta ?? "");
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(message, meta ?? "");
  }
}
