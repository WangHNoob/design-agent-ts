export interface ParameterDescriptor {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly enum?: string[];
}

import type { ToolRiskLevel } from "./ToolRiskLevel.js";

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, ParameterDescriptor>;
  /** Declared risk level; composition root / config may override. */
  readonly riskLevel?: ToolRiskLevel;
}
