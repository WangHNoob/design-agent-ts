'use client';

import type { KnowledgeSource } from '@/lib/stores/taskStore';

interface Props {
  sources: KnowledgeSource[];
}

export default function KnowledgeSourcesPanel({ sources }: Props) {
  if (sources.length === 0) {
    return (
      <div className="text-xs text-ink/50 py-6 text-center">
        尚未引用 Knowledge Hub 证据。Agent 调用 kb_* 工具后会显示在这里。
      </div>
    );
  }

  const deduped = dedupeSources(sources);

  return (
    <div className="flex flex-col gap-2">
      {deduped.map((source) => (
        <div key={`${source.type}:${source.id}`} className="border border-ink/8 rounded-md px-2.5 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-ink truncate">{source.title || source.id}</div>
              <div className="text-[10px] text-ink/50 font-mono truncate">{source.id}</div>
            </div>
            {source.trust && (
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${trustClass(source.trust.status)}`}>
                {Math.round(source.trust.score * 100)}% · {trustLabel(source.trust.status)}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink/60">
            {source.release?.version && <span>发布 {source.release.version}</span>}
            {source.release?.releaseId && <span className="font-mono">rel:{source.release.releaseId.slice(0, 10)}</span>}
            {source.evidence && (
              <span>
                证据 {source.evidence.count}
                {source.evidence.hasEvidence ? '' : '（缺失）'}
              </span>
            )}
            {source.componentKind && <span>{source.componentKind}</span>}
          </div>
          {source.qualityFlags && source.qualityFlags.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-700/80 truncate">
              flags: {source.qualityFlags.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function dedupeSources(sources: KnowledgeSource[]): KnowledgeSource[] {
  const map = new Map<string, KnowledgeSource>();
  for (const source of sources) {
    map.set(`${source.type}:${source.id}`, source);
  }
  return [...map.values()];
}

function trustLabel(status: string): string {
  switch (status) {
    case 'trusted': return '可信';
    case 'usable_with_risk': return '可用有风险';
    case 'needs_review': return '待复核';
    case 'blocked': return '阻断';
    default: return status;
  }
}

function trustClass(status: string): string {
  switch (status) {
    case 'trusted': return 'bg-emerald-50 text-emerald-700';
    case 'usable_with_risk': return 'bg-amber-50 text-amber-700';
    case 'needs_review': return 'bg-orange-50 text-orange-700';
    case 'blocked': return 'bg-red-50 text-red-700';
    default: return 'bg-ink/5 text-ink/60';
  }
}
