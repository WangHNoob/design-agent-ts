import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { LoggerPort } from "../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../observability/ConsoleLogger.js";
import type { HookContext } from "../../port/hook/HookContext.js";

export class LoggingHook implements AgentHook {
  priority = 10;

  private readonly logger: LoggerPort;

  constructor(logger?: LoggerPort) {
    this.logger = logger ?? new ConsoleLogger();
  }

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    const agentName = context.agentName ?? "unknown";
    const sessionId = context.sessionId ?? "unknown";
    this.logger.info(`[Hook] ${point} | agent=${agentName} | session=${sessionId}`);
    return context;
  }
}
