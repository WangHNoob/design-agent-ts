import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import type { ToolResult } from "../../port/tool/ToolResult.js";
import { ToolResult as TR } from "../../port/tool/ToolResult.js";
import fs from "fs/promises";

interface GraphData {
  nodes: Array<{ id: string; type: string; properties: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; relation: string }>;
}

export class KnowledgeGraphTool implements ToolPort {
  private graphData: GraphData | null = null;

  constructor(private graphPath: string) {}

  private async loadGraph(): Promise<GraphData> {
    if (this.graphData) return this.graphData;
    const raw = await fs.readFile(this.graphPath, "utf-8");
    this.graphData = JSON.parse(raw) as GraphData;
    return this.graphData;
  }

  getDescriptor(): ToolDescriptor {
    return {
      name: "kg_query",
      description: "从知识图谱查询实体节点与邻接关系",
      parameters: {
        entity: {
          name: "entity",
          type: "string",
          description: "要查询的实体名称",
          required: true,
        },
        depth: {
          name: "depth",
          type: "number",
          description: "查询深度（默认 1）",
          required: false,
          defaultValue: 1,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const entity = args.entity as string;
    const graph = await this.loadGraph();

    const node = graph.nodes.find((n) => n.id === entity);
    if (!node) return TR.error(`实体不存在: ${entity}`);

    const edges = graph.edges.filter((e) => e.source === entity || e.target === entity);
    return TR.success(JSON.stringify({ node, edges }, null, 2));
  }
}
