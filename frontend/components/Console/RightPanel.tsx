'use client';

import { useState } from 'react';
import { GitBranch, Terminal, FolderOpen, BookOpen } from 'lucide-react';
import StepsTimeline, { type TimelineEntry } from './StepsTimeline';
import DetailedLogs, { type DetailedLog } from './DetailedLogs';
import FileBrowserPanel from './FileBrowserPanel';
import KnowledgeSourcesPanel from './KnowledgeSourcesPanel';
import type { KnowledgeSource } from '@/lib/stores/taskStore';

interface Props {
  timeline: TimelineEntry[];
  logs: DetailedLog[];
  knowledgeSources: KnowledgeSource[];
  sessionId: string | null;
  messageCount: number;
  executionTime: string;
  onClearLogs: () => void;
  activeTab?: 'steps' | 'logs' | 'files' | 'knowledge';
  onChangeTab?: (tab: 'steps' | 'logs' | 'files' | 'knowledge') => void;
}

export default function RightPanel({
  timeline,
  logs,
  knowledgeSources,
  sessionId,
  messageCount,
  executionTime,
  onClearLogs,
  activeTab: activeTabProp,
  onChangeTab,
}: Props) {
  const [internalTab, setInternalTab] = useState<'steps' | 'logs' | 'files' | 'knowledge'>('steps');
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (tab: 'steps' | 'logs' | 'files' | 'knowledge') => {
    setInternalTab(tab);
    onChangeTab?.(tab);
  };

  return (
    <div className="h-full w-full flex flex-col bg-white border-l border-ink/8 shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink/8 shrink-0">
        <span className="text-sm font-semibold tracking-wider uppercase text-ink/90">
          执行监控
        </span>
        <div className="flex items-center gap-1">
          <TabBtn active={activeTab === 'steps'} onClick={() => setActiveTab('steps')} icon={<GitBranch size={14} />} label="步骤" count={timeline.length} />
          <TabBtn active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={14} />} label="日志" count={logs.length} />
          <TabBtn active={activeTab === 'knowledge'} onClick={() => setActiveTab('knowledge')} icon={<BookOpen size={14} />} label="证据" count={knowledgeSources.length} />
          <TabBtn active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<FolderOpen size={14} />} label="文件" />
        </div>
      </div>

      {/* Session info */}
      {sessionId && (
        <div className="px-3 py-2 border-b border-ink/6 text-xs text-ink/70 flex items-center gap-3 shrink-0">
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
        {activeTab === 'knowledge' && (
          <KnowledgeSourcesPanel sources={knowledgeSources} />
        )}
        {activeTab === 'files' && sessionId && (
          <FileBrowserPanel sessionId={sessionId} />
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
      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors ${
        active ? 'bg-coral/10 text-coral font-medium' : 'text-ink/60 hover:text-ink hover:bg-ink/10'
      }`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-mono">{count}</span>
      )}
    </button>
  );
}
