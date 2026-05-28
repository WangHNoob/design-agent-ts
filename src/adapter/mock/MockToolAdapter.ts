import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import type { ToolResult } from "../../port/tool/ToolResult.js";
import { ToolResult as TR } from "../../port/tool/ToolResult.js";

export class MockToolAdapter implements ToolPort {
  private descriptor: ToolDescriptor;
  private presetResult: ToolResult;

  constructor(
    descriptor: ToolDescriptor,
    presetResult?: ToolResult
  ) {
    this.descriptor = descriptor;
    this.presetResult = presetResult ?? TR.success("Mock tool result.");
  }

  getDescriptor(): ToolDescriptor {
    return this.descriptor;
  }

  async execute(_args: Record<string, unknown>): Promise<ToolResult> {
    return this.presetResult;
  }
}
