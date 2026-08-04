/**
 * Structured logger contract for the core layer.
 *
 * Core code must never call console.* directly: logging goes through this
 * port so the composition root can attach trace context, sinks, or silence.
 * A default `ConsoleLogger` lives in core/observability (core may implement
 * its own ports); adapters can wrap this port to route into O11y/Langfuse.
 */
export interface LoggerPort {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
