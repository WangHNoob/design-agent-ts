import { Hono } from "hono";
import type { CostStorePort } from "../../port/cost/CostStorePort.js";
import type { RateLimitPort } from "../../port/cost/RateLimitPort.js";
import type { CostGroupDimension } from "../../port/cost/types.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import { requireAdmin } from "../middleware/auth.js";

export interface CostRouteDependencies {
  costStore: CostStorePort | null;
  rateLimit: RateLimitPort | null;
  enabled: boolean;
}

let deps: CostRouteDependencies = {
  costStore: null,
  rateLimit: null,
  enabled: false,
};

export function setCostRouteDependencies(next: CostRouteDependencies): void {
  deps = next;
}

export const costRoute = new Hono();

function parseGroupBy(raw: string | undefined): CostGroupDimension | null {
  switch (raw) {
    case "user":
      return "userId";
    case "agent":
      return "agent";
    case "workflow":
      return "workflow";
    case "model":
      return "model";
    default:
      return null;
  }
}

costRoute.get("/summary", async (c) => {
  if (!deps.enabled || !deps.costStore) {
    return c.json({ error: "Cost tracking is not enabled" }, 503);
  }

  const tenant = c.get("tenant") as TenantContext;
  const from = c.req.query("from");
  const to = c.req.query("to");
  const groupBy = parseGroupBy(c.req.query("groupBy") ?? "agent");

  if (!groupBy) {
    return c.json({ error: "groupBy must be user, agent, workflow, or model" }, 400);
  }

  const isAdmin = tenant.role === "admin";
  const wantsGlobal = groupBy === "userId" && isAdmin;

  const aggregates = wantsGlobal
    ? await deps.costStore.listTopSpenders({ from, to, limit: 50 })
    : await deps.costStore.aggregate({
        groupBy,
        from,
        to,
        userId: isAdmin ? undefined : tenant.userId,
      });

  return c.json({
    from,
    to,
    groupBy,
    aggregates,
  });
});

costRoute.get("/me", async (c) => {
  if (!deps.enabled || !deps.costStore) {
    return c.json({ error: "Cost tracking is not enabled" }, 503);
  }

  const tenant = c.get("tenant") as TenantContext;
  const from = c.req.query("from");
  const to = c.req.query("to");

  const [byAgent, byWorkflow, remaining] = await Promise.all([
    deps.costStore.aggregate({
      groupBy: "agent",
      from,
      to,
      userId: tenant.userId,
    }),
    deps.costStore.aggregate({
      groupBy: "workflow",
      from,
      to,
      userId: tenant.userId,
    }),
    deps.rateLimit?.getRemaining(tenant.userId) ?? Promise.resolve({}),
  ]);

  const totals = byAgent.reduce(
    (acc, row) => ({
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      estimatedCostMicros: acc.estimatedCostMicros + row.estimatedCostMicros,
      recordCount: acc.recordCount + row.recordCount,
    }),
    { inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0, recordCount: 0 },
  );

  return c.json({
    userId: tenant.userId,
    from,
    to,
    totals,
    byAgent,
    byWorkflow,
    rateLimitRemaining: remaining,
  });
});

/** Admin-only global top spenders shortcut. */
costRoute.get("/top", requireAdmin(), async (c) => {
  if (!deps.enabled || !deps.costStore) {
    return c.json({ error: "Cost tracking is not enabled" }, 503);
  }
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = c.req.query("limit");
  const spenders = await deps.costStore.listTopSpenders({
    from,
    to,
    limit: limit ? Number(limit) : undefined,
  });
  return c.json({ from, to, spenders });
});
