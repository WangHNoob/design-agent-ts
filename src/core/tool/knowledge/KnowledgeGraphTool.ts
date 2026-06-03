import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { FileSystemPort } from "../../../port/fs/FileSystemPort.js";
import { ToolDescriptor } from "../../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../port/tool/ToolResult.js";

interface GraphNode {
  id: string;
  type: string;
  wiki_page?: string | null;
  [key: string]: unknown;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  [key: string]: unknown;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class KnowledgeGraphTool implements ToolPort {
  private graph: GraphData | null = null;

  constructor(
    private graphPath: string,
    private fileSystem: FileSystemPort
  ) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "knowledge_graph",
      description: "知识图谱查询工具。支持查询节点信息、邻居关系、按类型列出节点。",
      parameters: {
        action: {
          name: "action",
          type: "string",
          description: "操作类型: query_node(查询节点), query_neighbors(查询邻居), list_nodes(列出节点)",
          required: true,
          enum: ["query_node", "query_neighbors", "list_nodes"],
        },
        node_id: {
          name: "node_id",
          type: "string",
          description: "节点 ID（query_node, query_neighbors 时用）",
          required: false,
        },
        node_type: {
          name: "node_type",
          type: "string",
          description: "节点类型过滤器（list_nodes 时用）",
          required: false,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action ?? "");
    try {
      switch (action) {
        case "query_node":
          return this.queryNode(String(args.node_id ?? ""));
        case "query_neighbors":
          return this.queryNeighbors(String(args.node_id ?? ""));
        case "list_nodes":
          return this.listNodes(String(args.node_type ?? ""));
        default:
          return ToolResult.error(`Unknown action: ${action}`);
      }
    } catch (err) {
      return ToolResult.error(err instanceof Error ? err.message : String(err));
    }
  }

  private async loadGraph(): Promise<GraphData> {
    if (this.graph) {
      return this.graph;
    }
    const content = await this.fileSystem.readFile(this.graphPath);
    if (content === null) {
      this.graph = { nodes: [], edges: [] };
      return this.graph;
    }
    this.graph = JSON.parse(content) as GraphData;
    return this.graph;
  }

  private async queryNode(nodeId: string): Promise<ToolResult> {
    if (!nodeId) {
      return ToolResult.error("node_id is required for query_node action");
    }
    const graph = await this.loadGraph();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return ToolResult.success(`Node not found: ${nodeId}`);
    }
    const lines = [`Node: ${node.id}`, `Type: ${node.type}`];
    if (node.wiki_page) {
      lines.push(`Wiki Page: ${node.wiki_page}`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== "id" && key !== "type" && key !== "wiki_page" && value !== undefined && value !== null) {
        lines.push(`${key}: ${String(value)}`);
      }
    }
    return ToolResult.success(lines.join("\n"));
  }

  private async queryNeighbors(nodeId: string): Promise<ToolResult> {
    if (!nodeId) {
      return ToolResult.error("node_id is required for query_neighbors action");
    }
    const graph = await this.loadGraph();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return ToolResult.success(`Node not found: ${nodeId}`);
    }
    const outgoing = graph.edges.filter((e) => e.source === nodeId);
    const incoming = graph.edges.filter((e) => e.target === nodeId);
    const lines = [`Node: ${nodeId}`, ""];
    if (outgoing.length > 0) {
      lines.push("Outgoing relations:");
      for (const e of outgoing) {
        lines.push(`  ${e.source} --[${e.relation}]--> ${e.target}`);
      }
    }
    if (incoming.length > 0) {
      lines.push("Incoming relations:");
      for (const e of incoming) {
        lines.push(`  ${e.source} --[${e.relation}]--> ${e.target}`);
      }
    }
    if (outgoing.length === 0 && incoming.length === 0) {
      lines.push("No relations found.");
    }
    return ToolResult.success(lines.join("\n"));
  }

  private async listNodes(nodeType: string): Promise<ToolResult> {
    const graph = await this.loadGraph();
    const filtered = nodeType
      ? graph.nodes.filter((n) => n.type === nodeType)
      : graph.nodes;
    if (filtered.length === 0) {
      return ToolResult.success(
        nodeType ? `No nodes found of type: ${nodeType}` : "No nodes found in graph."
      );
    }
    const lines = filtered.map((n) => `- ${n.id} (${n.type})`);
    return ToolResult.success(lines.join("\n"));
  }
}
