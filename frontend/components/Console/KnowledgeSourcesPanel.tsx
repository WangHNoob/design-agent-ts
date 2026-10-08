'use client';

import type { KnowledgeSource } from '@/lib/stores/taskStore';

interface Props {
  sources: KnowledgeSource[];
}

// 仅在有证据时由 RightPanel 渲染（空 tab 不出现），故无需空态分支
export default function KnowledgeSourcesPanel({ sources }: Props) {
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
            {typeof source.score === 'number' && (
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${scoreClass(source.score)}`}>
                {source.score.toFixed(2)}
              </span>
            )}
          </div>
          {source.snippet && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink/60 line-clamp-2">{source.snippet}</p>
          )}
          {source.relevance && <div className="mt-1 text-[10px] text-ink/50 truncate">{source.relevance}</div>}
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

/** 检索得分着色：高分离命中越近，低分提示弱相关 */
function scoreClass(score: number): string {
  if (score >= 0.8) return 'bg-emerald-50 text-emerald-700';
  if (score >= 0.5) return 'bg-ink/5 text-ink/70';
  return 'bg-amber-50 text-amber-700';
}
