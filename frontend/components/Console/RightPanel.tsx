'use client';

import { useState } from 'react';
import { GitBranch, Zap, Terminal, X } from 'lucide-react';
import AgentStatusCards, { type AgentStatus } from './AgentStatusCards';

export interface ExecStep {
  time: string;
  message: string;
}

export interface DebugLog {
  time: string;
  category: 'info' | 'warn' | 'error' | 'sse' | 'user';
  message: string;
  data?: string;
}

interface Props {
  steps: ExecStep[];
  logs: DebugLog[];
  agents: AgentStatus[];
  sessionId: string | null;
  messageCount: number;
  executionTime: string;
  onClearLogs: () => void;
}

export default function RightPanel({
  steps,
  logs,
  agents,
  sessionId,
  messageCount,
  executionTime,
  onClearLogs,
}: Props) {
  const [activeTab, setActiveTab] = useState<'steps' | 'logs' | 'agents'>('steps');

  return (
    <div className="h-full flex flex-col bg-white border-l border-ink/8 shadow-sm w-80 shrink-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink/8 shrink-0">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-ink/40">
          执行监控
        </span>
        <div className="flex items-center gap-1">
          <TabBtn active={activeTab === 'steps'} onClick={() => setActiveTab('steps')} icon={<GitBranch size={11} />} label="步骤" count={steps.length} />
          <TabBtn active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={11} />} label="日志" count={logs.length} />
          <TabBtn active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} icon={<Zap size={11} />} label="Agent" />
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
          <StepsTab steps={steps} />
        )}
        {activeTab === 'logs' && (
          <LogsTab logs={logs} onClear={onClearLogs} />
        )}
        {activeTab === 'agents' && (
          <AgentStatusCards agents={agents} />
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

function StepsTab({ steps }: { steps: ExecStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <GitBranch size={20} className="text-ink/20 mb-2" />
        <p className="text-[12px] text-ink/40">等待执行…</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-start gap-2 text-[11px]">
          <span className="shrink-0 text-ink/25 font-mono mt-0.5">{step.time}</span>
          <span className="text-ink/70 break-all">{step.message}</span>
        </div>
      ))}
    </div>
  );
}

function LogsTab({ logs, onClear }: { logs: DebugLog[]; onClear: () => void }) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Terminal size={20} className="text-ink/20 mb-2" />
        <p className="text-[12px] text-ink/40">暂无日志</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-ink/30">{logs.length} 条</span>
        <button onClick={onClear} className="text-[10px] text-ink/30 hover:text-coral transition-colors">
          清空
        </button>
      </div>
      {logs.map((log, idx) => {
        const catColor = {
          info: 'text-blue-600 bg-blue-50',
          warn: 'text-amber-600 bg-amber-50',
          error: 'text-red-600 bg-red-50',
          sse: 'text-violet-600 bg-violet-50',
          user: 'text-emerald-600 bg-emerald-50',
        }[log.category];

        return (
          <div key={idx} className="rounded-md border border-transparent hover:border-ink/6 hover:bg-paper/30 transition-colors">
            <div className="flex items-start gap-1.5 px-1.5 py-1">
              <span className="shrink-0 text-[9px] text-ink/25 font-mono mt-0.5">{log.time}</span>
              <span className={`shrink-0 text-[9px] font-bold px-1 rounded ${catColor}`}>
                {log.category.toUpperCase()}
              </span>
              <span className="text-[11px] text-ink/70 break-all flex-1">{log.message}</span>
            </div>
            {log.data && (
              <pre className="mx-1.5 mb-1 px-2 py-1 bg-ink/5 rounded text-[10px] text-ink/50 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                {log.data}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
