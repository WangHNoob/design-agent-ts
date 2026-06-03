'use client';

import { Gamepad2, Settings, Plus, PanelRight } from 'lucide-react';

interface Props {
  mode: 'design' | 'query' | 'table';
  onModeChange: (mode: 'design' | 'query' | 'table') => void;
  role: string;
  onRoleChange: (role: string) => void;
  status: 'idle' | 'working' | 'waiting' | 'error';
  statusText: string;
  onNewChat: () => void;
  onToggleRightPanel: () => void;
  rightPanelOpen: boolean;
  onOpenSettings?: () => void;
}

const MODES: { id: 'design' | 'query' | 'table'; label: string }[] = [
  { id: 'design', label: '策划生成' },
  { id: 'query', label: '知识查询' },
  { id: 'table', label: '配表工具' },
];

const ROLES = [
  { value: 'chief_designer', label: '主策划' },
  { value: 'system_designer', label: '系统策划' },
  { value: 'combat_designer', label: '战斗策划' },
  { value: 'numerical_planner', label: '数值策划' },
  { value: 'gameplay_designer', label: '玩法策划' },
  { value: 'executive_planner', label: '执行策划' },
  { value: 'qa_planner', label: 'QA 策划' },
];

export default function Header({
  mode,
  onModeChange,
  role,
  onRoleChange,
  status,
  statusText,
  onNewChat,
  onToggleRightPanel,
  rightPanelOpen,
  onOpenSettings,
}: Props) {
  const statusDot = {
    idle: 'bg-ink/30',
    working: 'bg-amber-400 animate-pulse',
    waiting: 'bg-coral',
    error: 'bg-red-500',
  }[status];

  return (
    <header className="h-14 shrink-0 bg-white/90 border-b border-ink/8 flex items-center px-4 gap-4 z-50 backdrop-blur-md">
      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-coral text-white text-sm font-bold">
          G
        </div>
        <div className="hidden md:block">
          <h1 className="text-sm font-bold text-ink leading-tight">游戏策划 AI</h1>
          <span className="text-[10px] text-ink/40 leading-none">对话式设计助手</span>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex items-center bg-paper/50 border border-ink/6 rounded-lg p-0.5 gap-0.5 shrink-0">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
              mode === m.id
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink/40 hover:text-ink/70'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Role selector */}
      <div className="flex items-center gap-1.5 shrink-0 ml-1">
        <span className="text-[11px] text-ink/40">角色:</span>
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          className="bg-paper/50 border border-ink/6 rounded-md px-2 py-1 text-[11px] text-ink focus:outline-none focus:border-coral/40 cursor-pointer"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1" />

      {/* Status */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`w-2 h-2 rounded-full ${statusDot}`} />
        <span className="text-[11px] text-ink/40 font-mono">{statusText}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink/50 hover:bg-ink/5 hover:text-ink transition-colors"
          title="API 设置"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink/50 hover:bg-ink/5 hover:text-ink transition-colors"
          title="新建对话"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">新建</span>
        </button>
        <button
          onClick={onToggleRightPanel}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            rightPanelOpen ? 'bg-coral/10 text-coral' : 'text-ink/50 hover:bg-ink/5 hover:text-ink'
          }`}
          title="切换监控面板"
        >
          <PanelRight size={14} />
        </button>
      </div>
    </header>
  );
}
