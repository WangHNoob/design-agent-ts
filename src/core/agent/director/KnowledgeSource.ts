/**
 * 标准化的知识来源接口
 * 用于统一表示从 Knowledge Hub MCP 工具返回的知识元数据
 */

export interface KnowledgeSource {
  /** 来源类型 */
  type: 'kb_component' | 'wiki_page' | 'kg_node' | 'grep_match' | 'web_result';
  
  /** 唯一标识符（componentId、pagePath、nodeId 等） */
  id: string;
  
  /** 显示标题 */
  title?: string;
  
  /** 相关性说明 */
  relevance?: string;
  
  /** 可信度信息（仅 kb_* 工具提供） */
  trust?: {
    score: number;
    status: 'trusted' | 'usable_with_risk' | 'needs_review' | 'blocked';
    breakdown?: {
      evidence?: number;
      completeness?: number;
      auditFreshness?: number;
      consistency?: number;
    };
  };
  
  /** 证据信息（仅 kb_* 工具提供） */
  evidence?: {
    count: number;
    evidenceIds?: string[];
    hasEvidence: boolean;
  };
  
  /** 发布信息（仅 kb_* 工具提供） */
  release?: {
    releaseId: string;
    version: string;
    publishedAt: string;
  };
  
  /** 质量标志（仅 kb_* 工具提供） */
  qualityFlags?: string[];
  
  /** 组件类型（仅 kb_* 工具提供） */
  componentKind?: string;
  
  /** 工件 ID（仅 kb_* 工具提供） */
  artifactId?: string;
}

/**
 * 从 Knowledge Hub MCP 工具的 structuredContent 解析知识来源
 */
export function parseKnowledgeHubMetadata(
  toolName: string,
  metadata: Record<string, unknown>
): KnowledgeSource[] {
  if (!toolName.startsWith('kb_')) return [];
  
  const structuredContent = metadata.structuredContent as Record<string, unknown> | undefined;
  if (!structuredContent) return [];
  
  const sources: KnowledgeSource[] = [];
  
  // 提取发布信息
  const release = structuredContent.release as Record<string, unknown> | undefined;
  const releaseInfo = release ? {
    releaseId: String(release.releaseId || ''),
    version: String(release.version || ''),
    publishedAt: String(release.publishedAt || ''),
  } : undefined;
  
  // 提取追踪信息
  const trace = structuredContent.trace as Record<string, unknown> | undefined;
  const componentIds = (trace?.componentIds as string[]) || [];
  const evidenceIds = (trace?.evidenceIds as string[]) || [];
  
  // 提取可信度信息
  const trust = structuredContent.trust as Record<string, unknown> | undefined;
  const trustComponents = (trust?.components as Array<Record<string, unknown>>) || [];
  
  // 提取质量标志
  const qualityFlags = (structuredContent.qualityFlags as string[]) || [];
  
  // 提取结果数据
  const result = structuredContent.result as Record<string, unknown> | undefined;
  
  // 根据不同工具类型解析
  if (toolName === 'kb_search' && result) {
    const items = (result.items as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      const componentId = String(item.componentId || '');
      if (!componentId) continue;
      
      const itemTrust = item.trust as Record<string, unknown> | undefined;
      const itemEvidence = item.evidence as Record<string, unknown> | undefined;
      
      sources.push({
        type: 'kb_component',
        id: componentId,
        title: String(item.title || ''),
        componentKind: String(item.kind || ''),
        artifactId: String(item.artifactId || ''),
        trust: itemTrust ? parseTrustScore(itemTrust) : undefined,
        evidence: itemEvidence ? {
          count: Number(itemEvidence.count || 0),
          hasEvidence: Boolean(itemEvidence.traceable),
        } : undefined,
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(componentId)),
      });
    }
  } else if (toolName === 'kb_get_page' && result) {
    const componentId = String(result.componentId || '');
    if (componentId) {
      const componentTrust = trustComponents.find(t => t.componentId === componentId);
      sources.push({
        type: 'kb_component',
        id: componentId,
        title: String(result.title || ''),
        componentKind: 'wiki_page',
        artifactId: String(result.artifactId || ''),
        trust: componentTrust?.trust ? parseTrustScore(componentTrust.trust as Record<string, unknown>) : undefined,
        evidence: {
          count: evidenceIds.filter(id => id.includes(componentId)).length,
          evidenceIds: evidenceIds.filter(id => id.includes(componentId)),
          hasEvidence: evidenceIds.some(id => id.includes(componentId)),
        },
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(componentId)),
      });
    }
  } else if (toolName === 'kb_get_entity' && result) {
    const componentIds = (trace?.componentIds as string[]) || [];
    const firstComponentId = componentIds[0];
    if (firstComponentId) {
      const componentTrust = trustComponents.find(t => t.componentId === firstComponentId);
      sources.push({
        type: 'kb_component',
        id: firstComponentId,
        title: String((result.node as Record<string, unknown>)?.label || ''),
        componentKind: 'graph_entity',
        trust: componentTrust?.trust ? parseTrustScore(componentTrust.trust as Record<string, unknown>) : undefined,
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(firstComponentId)),
      });
    }
  } else if (toolName === 'kb_get_quality' && result) {
    const components = (result.components as Array<Record<string, unknown>>) || [];
    for (const comp of components) {
      const componentId = String(comp.componentId || '');
      if (!componentId) continue;
      
      const quality = comp.quality as Record<string, unknown> | undefined;
      sources.push({
        type: 'kb_component',
        id: componentId,
        title: String(comp.title || ''),
        componentKind: String(comp.kind || ''),
        trust: quality ? parseTrustScore(quality) : undefined,
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(componentId)),
      });
    }
  } else if (toolName === 'kb_get_evidence' && result) {
    const componentIdsInResult = (result.componentIds as string[]) || [];
    const records = (result.records as Array<Record<string, unknown>>) || [];
    
    for (const compId of componentIdsInResult) {
      const compEvidence = records.filter(r => 
        String(r.component_id || r.componentId || '') === compId
      );
      const componentTrust = trustComponents.find(t => t.componentId === compId);
      
      sources.push({
        type: 'kb_component',
        id: compId,
        title: String(componentTrust?.title || compId),
        componentKind: String(componentTrust?.kind || ''),
        trust: componentTrust?.trust ? parseTrustScore(componentTrust.trust as Record<string, unknown>) : undefined,
        evidence: {
          count: compEvidence.length,
          evidenceIds: compEvidence.map(r => String(r.evidence_id || r.evidenceId || '')),
          hasEvidence: compEvidence.length > 0,
        },
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(compId)),
      });
    }
  } else if (toolName === 'kb_resolve_topic' && result) {
    const targets = (result.targets as Array<Record<string, unknown>>) || [];
    for (const target of targets.slice(0, 3)) {
      const componentId = String(target.componentId || '');
      if (!componentId) continue;
      
      const targetTrust = target.trust as Record<string, unknown> | undefined;
      sources.push({
        type: 'kb_component',
        id: componentId,
        title: String(target.title || ''),
        componentKind: String(target.type || ''),
        trust: targetTrust ? parseTrustScore(targetTrust) : undefined,
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(componentId)),
      });
    }
  } else if (toolName === 'kb_list_tables' && result) {
    const tables = (result.tables as Array<Record<string, unknown>>) || [];
    for (const table of tables.slice(0, 10)) {
      const componentId = String(table.componentId || '');
      if (!componentId) continue;
      
      const tableTrust = table.trust as Record<string, unknown> | undefined;
      sources.push({
        type: 'kb_component',
        id: componentId,
        title: String(table.table || ''),
        componentKind: 'table_schema',
        trust: tableTrust ? parseTrustScore(tableTrust) : undefined,
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(componentId)),
      });
    }
  } else if (toolName === 'kb_get_table_schema' && result) {
    const componentIds = (trace?.componentIds as string[]) || [];
    const componentId = componentIds[0] || '';
    if (componentId) {
      const componentTrust = trustComponents.find(t => t.componentId === componentId);
      sources.push({
        type: 'kb_component',
        id: componentId,
        title: String(result.table || ''),
        componentKind: 'table_schema',
        trust: componentTrust?.trust ? parseTrustScore(componentTrust.trust as Record<string, unknown>) : undefined,
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(componentId)),
      });
    }
  } else if (componentIds.length > 0) {
    // 通用回退：从 trace.componentIds 提取
    for (const compId of componentIds.slice(0, 5)) {
      const componentTrust = trustComponents.find(t => t.componentId === compId);
      sources.push({
        type: 'kb_component',
        id: compId,
        title: String(componentTrust?.title || compId),
        componentKind: String(componentTrust?.kind || ''),
        trust: componentTrust?.trust ? parseTrustScore(componentTrust.trust as Record<string, unknown>) : undefined,
        evidence: {
          count: evidenceIds.filter(id => id.includes(compId)).length,
          hasEvidence: evidenceIds.some(id => id.includes(compId)),
        },
        release: releaseInfo,
        qualityFlags: qualityFlags.filter(f => f.includes(compId)),
      });
    }
  }
  
  return sources;
}

/**
 * 解析可信度分数
 */
function parseTrustScore(trust: Record<string, unknown>): KnowledgeSource['trust'] {
  const score = Number(trust.score || 0);
  const status = String(trust.status || 'needs_review');
  const breakdown = trust.breakdown as Record<string, unknown> | undefined;
  
  return {
    score,
    status: status as KnowledgeSource['trust'] extends infer T ? T extends { status: infer S } ? S : never : never,
    breakdown: breakdown ? {
      evidence: Number(breakdown.evidence || 0),
      completeness: Number(breakdown.completeness || 0),
      auditFreshness: Number(breakdown.auditFreshness || 0),
      consistency: Number(breakdown.consistency || 0),
    } : undefined,
  };
}
