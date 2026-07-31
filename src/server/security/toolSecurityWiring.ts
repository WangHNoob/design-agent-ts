import type { FrameworkConfig } from "../../config/FrameworkConfig.js";
import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type { ToolApprovalPort } from "../../port/tool/ToolApprovalPort.js";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type { HITLRepository } from "../../port/hitl/HITLRepository.js";
import type { TraceRuntimeState } from "../../port/tracing/TracerPort.js";
import { ToolRiskResolver } from "../../core/tool/ToolRiskResolver.js";
import {
  ToolSecurityWrapper,
  type ToolSecurityContext,
  type ToolSecurityOptions,
} from "../../core/tool/ToolSecurityWrapper.js";

export interface ToolSecurityWiringDeps {
  config: FrameworkConfig;
  auditStore: AuditStorePort | null;
  approvalStore: ToolApprovalPort;
  tenantContextStorage: ContextStoragePort<TenantContext>;
  traceContextStorage: ContextStoragePort<TraceRuntimeState>;
  idGenerator: IdGeneratorPort;
  hitlRepositoryFactory?: (userId: string) => HITLRepository;
}

export function buildToolSecurityOptions(deps: ToolSecurityWiringDeps): ToolSecurityOptions {
  const riskResolver = new ToolRiskResolver({
    toolRiskOverrides: deps.config.security.toolRiskOverrides,
    irreversibleToolNames: deps.config.security.irreversibleToolNames,
    irreversibleNameKeywords: deps.config.security.irreversibleNameKeywords,
  });

  const resolveContext = (): ToolSecurityContext => {
    const tenant = deps.tenantContextStorage.getStore();
    const trace = deps.traceContextStorage.getStore();
    return {
      userId: tenant?.userId,
      sessionId: tenant?.sessionId,
      executionId: trace?.executionId,
      traceId: trace?.traceId,
    };
  };

  const onIrreversibleDenied =
    deps.config.security.irreversibleRequireHitl
    && deps.hitlRepositoryFactory
      ? async (input: Parameters<NonNullable<ToolSecurityOptions["onIrreversibleDenied"]>>[0]) => {
          const repo = deps.hitlRepositoryFactory!(input.userId);
          const checkpointId = deps.idGenerator.randomUUID();
          const content = [
            "## Irreversible tool approval required",
            "",
            `- **Tool**: \`${input.toolName}\``,
            `- **Args hash**: \`${input.argsHash}\``,
            "",
            "```json",
            JSON.stringify(input.argsSummary, null, 2),
            "```",
          ].join("\n");

          const result = await repo.create({
            id: checkpointId,
            sessionId: input.sessionId,
            executionId: input.executionId,
            stage: "subagent",
            content,
            contentType: "markdown",
            reviewPoint: "hitl-tool-irreversible",
            idempotencyKey: `tool-irreversible:${input.toolName}:${input.argsHash}`,
            resumePayload: {
              toolName: input.toolName,
              argsHash: input.argsHash,
              sessionId: input.sessionId,
            },
          });
          return result.checkpoint.id;
        }
      : undefined;

  return {
    resolveRiskLevel: (name, descriptorRisk) => riskResolver.resolve(name, descriptorRisk),
    approvalStore: deps.approvalStore,
    sandbox: {
      denyKeywords: deps.config.security.sandboxDenyKeywords,
      blockPathTraversal: deps.config.security.sandboxBlockPathTraversal,
    },
    auditEnabled: deps.config.security.auditEnabled,
    auditStore: deps.auditStore ?? undefined,
    irreversibleRequireHitl: deps.config.security.irreversibleRequireHitl,
    resolveContext,
    onIrreversibleDenied,
  };
}

export function wrapToolWithSecurity(tool: ToolPort, options: ToolSecurityOptions): ToolPort {
  return new ToolSecurityWrapper(tool, options);
}
