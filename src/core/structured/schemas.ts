import type { Domain } from "../schema/TaskPlan.js";
import { z } from "zod";

export const DomainSchema = z.enum([
  "system_design",
  "combat_design",
  "numerical_planning",
  "gameplay_design",
  "executive_planning",
  "qa",
]);

function normalizeDomain(raw: string): Domain {
  const normalized = raw.toLowerCase().replace(/-/g, "_");
  const parsed = DomainSchema.safeParse(normalized);
  if (!parsed.success) {
    return "system_design";
  }
  return parsed.data;
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

function parseAllowedTools(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.map((v) => String(v)).filter((v) => v.length > 0);
}

export interface TaskPlanParsed {
  planId: string;
  subTasks: Array<{
    id: string;
    fragmentId: string;
    domain: Domain;
    description: string;
    dependencies: string[];
    priority: number;
    allowedTools?: string[];
  }>;
}

export interface RouteDecisionParsed {
  fragmentId: string;
  domain: Domain;
  agentName: string;
  assignment: string;
  priority: number;
}

export interface ReplanRemainingParsed {
  id: string;
  fragmentId: string;
  domain: Domain;
  description: string;
  dependencies: string[];
  priority: number;
  allowedTools?: string[];
}

export interface RefinedRequirementsParsed {
  taskId: string;
  refinedRequirement: string;
}

const RawSubTaskSchema = z.record(z.unknown());

export const TaskPlanSchema = z
  .object({
    planId: z.union([z.string(), z.number()]).optional(),
    subTasks: z.array(RawSubTaskSchema).optional(),
    sub_tasks: z.array(RawSubTaskSchema).optional(),
  })
  .superRefine((raw, ctx) => {
    const list = raw.subTasks ?? raw.sub_tasks;
    if (!Array.isArray(list) || list.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subTasks must be a non-empty array",
        path: ["subTasks"],
      });
      return;
    }
    list.forEach((item, idx) => {
      const id = asString(item.id ?? item.taskId);
      const description = asString(item.description ?? item.requirement ?? item.assignment);
      if (!id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "id or taskId is required",
          path: ["subTasks", idx, "id"],
        });
      }
      if (!description.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "description is required",
          path: ["subTasks", idx, "description"],
        });
      }
      if (item.domain !== undefined && item.domain !== null) {
        const domain = asString(item.domain).toLowerCase().replace(/-/g, "_");
        if (!DomainSchema.safeParse(domain).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `invalid domain "${asString(item.domain)}"`,
            path: ["subTasks", idx, "domain"],
          });
        }
      }
    });
  })
  .transform((raw): TaskPlanParsed => {
    const list = (raw.subTasks ?? raw.sub_tasks ?? []) as Array<Record<string, unknown>>;
    return {
      planId: asString(raw.planId) || "auto",
      subTasks: list.map((item, idx) => {
        const id = asString(item.id ?? item.taskId) || `T${idx + 1}`;
        const allowedTools = parseAllowedTools(item.allowedTools);
        return {
          id,
          fragmentId: asString(item.fragmentId) || id,
          domain: normalizeDomain(asString(item.domain) || "system_design"),
          description: asString(item.description ?? item.requirement ?? item.assignment),
          dependencies: asStringArray(item.dependencies),
          priority: typeof item.priority === "number" ? item.priority : idx + 1,
          ...(allowedTools !== undefined ? { allowedTools } : {}),
        };
      }),
    };
  });

const RawRouteItemSchema = z.record(z.unknown());

export const RouteDecisionArraySchema = z
  .array(RawRouteItemSchema)
  .min(1, "route decisions must be a non-empty array")
  .superRefine((arr, ctx) => {
    arr.forEach((item, idx) => {
      const fragmentId = asString(item.fragmentId ?? item.taskId ?? item.id);
      const assignment = asString(item.assignment ?? item.description ?? item.requirement);
      if (!fragmentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "fragmentId is required",
          path: [idx, "fragmentId"],
        });
      }
      if (!assignment.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "assignment is required",
          path: [idx, "assignment"],
        });
      }
      if (item.domain !== undefined && item.domain !== null) {
        const domain = asString(item.domain).toLowerCase().replace(/-/g, "_");
        if (!DomainSchema.safeParse(domain).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `invalid domain "${asString(item.domain)}"`,
            path: [idx, "domain"],
          });
        }
      }
    });
  })
  .transform((arr): RouteDecisionParsed[] =>
    arr.map((item, idx) => ({
      fragmentId: asString(item.fragmentId ?? item.taskId ?? item.id),
      domain: normalizeDomain(asString(item.domain) || "system_design"),
      agentName: asString(item.agentName ?? item.agent) || "SystemDesigner",
      assignment: asString(item.assignment ?? item.description ?? item.requirement),
      priority: typeof item.priority === "number" ? item.priority : idx + 1,
    })),
  );

const RawReplanItemSchema = z.record(z.unknown());

export const ReplanRemainingArraySchema = z
  .array(RawReplanItemSchema)
  .min(1, "replan remaining must be a non-empty array")
  .superRefine((arr, ctx) => {
    arr.forEach((item, idx) => {
      const id = asString(item.id ?? item.taskId);
      const description = asString(item.description ?? item.requirement ?? item.assignment);
      if (!id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "id is required",
          path: [idx, "id"],
        });
      }
      if (!description.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "description is required",
          path: [idx, "description"],
        });
      }
      if (item.domain !== undefined && item.domain !== null) {
        const domain = asString(item.domain).toLowerCase().replace(/-/g, "_");
        if (!DomainSchema.safeParse(domain).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `invalid domain "${asString(item.domain)}"`,
            path: [idx, "domain"],
          });
        }
      }
    });
  })
  .transform((arr): ReplanRemainingParsed[] =>
    arr.map((item, idx) => {
      const id = asString(item.id ?? item.taskId) || `R${idx + 1}`;
      const allowedTools = parseAllowedTools(item.allowedTools);
      return {
        id,
        fragmentId: asString(item.fragmentId) || id,
        domain: normalizeDomain(asString(item.domain) || "system_design"),
        description: asString(item.description ?? item.requirement ?? item.assignment),
        dependencies: asStringArray(item.dependencies),
        priority: typeof item.priority === "number" ? item.priority : idx + 1,
        ...(allowedTools !== undefined ? { allowedTools } : {}),
      };
    }),
  );

export const RefinedRequirementsArraySchema = z
  .array(
    z.object({
      taskId: z.string().min(1),
      refinedRequirement: z.string().min(1),
    }),
  )
  .min(1, "refined requirements must be a non-empty array");
