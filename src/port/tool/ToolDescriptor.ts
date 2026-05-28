export interface ParameterDescriptor {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly enum?: string[];
}

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, ParameterDescriptor>;
}
