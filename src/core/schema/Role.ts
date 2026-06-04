import type { Domain } from "./TaskPlan.js";

export type Role =
  | "chief_designer"
  | "system_designer"
  | "combat_designer"
  | "numerical_planner"
  | "gameplay_designer"
  | "executive_planner"
  | "qa_planner";

export const RoleDisplayNames: Record<Role, string> = {
  chief_designer: "主策划",
  system_designer: "系统策划",
  combat_designer: "战斗策划",
  numerical_planner: "数值策划",
  gameplay_designer: "玩法策划",
  executive_planner: "执行策划",
  qa_planner: "QA策划",
};

export const RoleAgentMap: Record<Role, string> = {
  chief_designer: "Director",
  system_designer: "SystemDesigner",
  combat_designer: "CombatDesigner",
  numerical_planner: "NumericalPlanner",
  gameplay_designer: "GameplayDesigner",
  executive_planner: "ExecutivePlanner",
  qa_planner: "QAPlanner",
};

const ROLE_DOMAINS: Record<Role, Domain[] | "all"> = {
  chief_designer: "all",
  system_designer: ["system_design"],
  combat_designer: ["combat_design"],
  numerical_planner: ["numerical_planning"],
  gameplay_designer: ["gameplay_design"],
  executive_planner: ["executive_planning"],
  qa_planner: ["qa"],
};

export function canAccessDomain(role: Role, domain: Domain): boolean {
  const allowed = ROLE_DOMAINS[role];
  if (allowed === "all") return true;
  return allowed.includes(domain);
}

export function parseRole(raw: string): Role {
  if (raw in RoleDisplayNames) return raw as Role;
  return "chief_designer";
}
