'use client';

import { useState } from 'react';
import { GitBranch, Terminal } from 'lucide-react';
import StepsTimeline, { type TimelineEntry } from './StepsTimeline';
import DetailedLogs, { type DetailedLog } from './DetailedLogs';

interface Props {
  timeline: TimelineEntry[];
  logs: DetailedLog[];
  sessionId: string | null;
  messageCount: number;
  executionTime: string;
  onClearLogs: () => void;
}

export default function RightPanel({
  timeline,
  logs,
  sessionId,
  messageCount,
  executionTime,
  onClearLogs,
}: Props) {
  const [activeTab, setActiveTab] = useState<'steps' | 'logs'>('steps');

  return (
    <div className="h-full flex flex-col bg-white border-l border-ink/8 shadow-sm w-80 shrink-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink/8 shrink-0">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-ink/40">
          执行监控
        </span>
        <div className="flex items-center gap-1">
          <TabBtn active={activeTab === 'steps'} onClick={() => setActiveTab('steps')} icon={<GitBranch size={11} />} label="步骤" count={timeline.length} />
          <TabBtn active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={11} />} label="日志" count={logs.length} />
        </div>
      </div>

      {/* Session info */}
      {sessionId && (
        <div className="px-3 py-2 border-b border-ink/6 text-[10px] text-ink/40 flex items-center gap-3 shrink-0">
          <span className="font-mono truncate">ID: {sessionId.slice(0, 8)}</span>
          <span>消息: {messageCount}</span>
          <span>耗时: {executionTime}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {activeTab === 'steps' && (
          <StepsTimeline entries={timeline} />
        )}
        {activeTab === 'logs' && (
          <DetailedLogs logs={logs} onClear={onClearLogs} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${
        active ? 'bg-coral/10 text-coral font-medium' : 'text-ink/30 hover:text-ink/60 hover:bg-ink/5'
      }`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[9px] font-mono">{count}</span>
      )}
    </button>
  );
}
