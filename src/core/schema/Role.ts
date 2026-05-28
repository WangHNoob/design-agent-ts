export type Role =
  | "chief_designer"
  | "system_designer"
  | "combat_designer"
  | "numerical_planner"
  | "gameplay_designer"
  | "executive_planner"
  | "qa";

export const RoleDisplayNames: Record<Role, string> = {
  chief_designer: "主策划",
  system_designer: "系统策划",
  combat_designer: "战斗策划",
  numerical_planner: "数值策划",
  gameplay_designer: "玩法策划",
  executive_planner: "执行策划",
  qa: "QA",
};
