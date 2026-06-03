'use client';

import { useState } from 'react';
import { GitBranch, ChevronDown, ChevronRight } from 'lucide-react';

export interface TimelineEntry {
  id: string;
  time: string;
  type: 'phase' | 'task' | 'tool' | 'complete' | 'error';
  title: string;
  detail?: string;
  agentName?: string;
  status: 'running' | 'completed' | 'error' | 'pending';
  durationMs?: number;
  children?: TimelineEntry[];
}

interface Props {
  entries: TimelineEntry[];
}

export default function StepsTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <GitBranch size={20} className="text-ink/20 mb-2" />
        <p className="text-[12px] text-ink/40">等待执行…</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => (
        <TimelineNode key={entry.id} entry={entry} level={0} />
      ))}
    </div>
  );
}

function TimelineNode({ entry, level }: { entry: TimelineEntry; level: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = entry.children && entry.children.length > 0;

  const statusIcon = {
    running: <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />,
    completed: <span className="text-emerald-500 text-[10px]">✓</span>,
    error: <span className="text-red-500 text-[10px]">✗</span>,
    pending: <span className="w-2 h-2 rounded-full bg-ink/10" />,
  }[entry.status];

  const indentClass = level === 0 ? '' : 'ml-4';
  const connector = level > 0 ? '├─ ' : '';

  return (
    <div>
      <div
        className={`flex items-start gap-2 text-[11px] py-1 px-1 rounded hover:bg-ink/5 transition-colors ${indentClass}`}
      >
        {/* Time */}
        <span className="shrink-0 text-ink/25 font-mono mt-0.5 w-12 text-[10px]">
          {entry.time}
        </span>

        {/* Expand/collapse button for entries with children */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-ink/30 hover:text-ink/60 transition-colors mt-0.5"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="shrink-0 w-3" />
        )}

        {/* Status icon */}
        <span className="shrink-0 flex items-center justify-center w-3 h-3 mt-0.5">
          {statusIcon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-ink/70">
              {connector}
              {entry.agentName && <span className="font-medium text-coral">{entry.agentName}: </span>}
              {entry.title}
            </span>
            {entry.durationMs !== undefined && (
              <span className="text-[9px] text-ink/25 font-mono">
                {formatDuration(entry.durationMs)}
              </span>
            )}
          </div>
          {entry.detail && (
            <div className="text-[10px] text-ink/40 mt-0.5">{entry.detail}</div>
          )}
        </div>
      </div>

      {/* Render children */}
      {hasChildren && expanded && (
        <div className="ml-2 border-l border-ink/10">
          {entry.children!.map((child) => (
            <TimelineNode key={child.id} entry={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
