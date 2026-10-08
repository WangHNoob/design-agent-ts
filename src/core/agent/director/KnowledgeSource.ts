/**
 * 标准化的知识来源接口（观测台「证据」面板数据契约）
 * 用于统一表示从知识库（WeKnora MCP）检索工具返回的证据
 */

export interface KnowledgeSource {
  /** 来源类型 */
  type: 'weknora_doc' | 'wiki_page' | 'kg_node' | 'grep_match' | 'web_result';

  /** 唯一标识符（knowledge_id#chunk、pagePath、nodeId 等） */
  id: string;

  /** 显示标题（WeKnora 为文档标题/文件名） */
  title?: string;

  /** 相关性说明 */
  relevance?: string;

  /** 检索得分（WeKnora hybrid_search / wiki_search 返回） */
  score?: number;

  /** 命中片段预览（截断） */
  snippet?: string;
}

/** 返回 { success, data: SearchResult[] } 信封的 WeKnora 检索工具 */
const WEKNORA_SEARCH_TOOLS = new Set(['hybrid_search', 'wiki_search']);

/** 单次上报来源上限（证据面板只做引用提示，不承担全文展示） */
const MAX_SOURCES = 8;

/**
 * 从 WeKnora MCP 工具返回中解析知识来源。
 * structuredContent 优先；文本通道为逐层 JSON 编码的信封时迭代解包。
 */
export function parseWeKnoraMetadata(
  toolName: string,
  metadata: Record<string, unknown>,
  rawResult: string,
): KnowledgeSource[] {
  if (!WEKNORA_SEARCH_TOOLS.has(toolName)) return [];

  const envelope = readEnvelope(metadata, rawResult);
  const data = envelope?.data;
  if (!Array.isArray(data)) return [];

  const sources: KnowledgeSource[] = [];
  for (const item of data.slice(0, MAX_SOURCES)) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const knowledgeId = String(record.knowledge_id || record.id || '');
    if (!knowledgeId) continue;

    const chunkIndex = Number(record.chunk_index ?? 0);
    const title = String(record.knowledge_title || record.knowledge_filename || '');
    const score = typeof record.score === 'number' ? record.score : undefined;
    const content = typeof record.content === 'string' ? record.content : '';

    sources.push({
      type: 'weknora_doc',
      id: chunkIndex ? `${knowledgeId}#chunk_${chunkIndex}` : knowledgeId,
      title: title || undefined,
      score,
      snippet: content ? content.slice(0, 160) : undefined,
    });
  }
  return sources;
}

/** structuredContent 优先；否则尝试把文本结果按 JSON 反复解包（最多 3 层） */
function readEnvelope(
  metadata: Record<string, unknown>,
  rawResult: string,
): Record<string, unknown> | undefined {
  const structured = metadata.structuredContent;
  if (isPlainObject(structured)) return structured;

  let current: unknown = rawResult;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'string' || current.trim() === '') break;
    try {
      current = JSON.parse(current);
    } catch {
      break;
    }
    if (isPlainObject(current)) return current;
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
