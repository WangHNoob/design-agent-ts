'use client';

import { Settings, Plus, PanelRight, LogOut, UserRound } from 'lucide-react';

interface IdentityChip {
  isDemo: boolean;
  label: string;
  quota?: string;
  onClick?: () => void;
}

interface Props {
  role: string;
  onRoleChange: (role: string) => void;
  roleLocked?: boolean;
  status: 'idle' | 'working' | 'waiting' | 'error';
  statusText: string;
  onNewChat: () => void;
  onToggleRightPanel: () => void;
  rightPanelOpen: boolean;
  onOpenSettings?: () => void;
  /** 身份标识（演示模式/管理员），演示模式点击可重开体验选择弹窗。 */
  identityChip?: IdentityChip | null;
}

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
  role,
  onRoleChange,
  roleLocked,
  status,
  statusText,
  onNewChat,
  onToggleRightPanel,
  rightPanelOpen,
  onOpenSettings,
  identityChip,
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

      {/* Role selector */}
      <div className="flex items-center gap-1.5 shrink-0 ml-1">
        <span className="text-[11px] text-ink/40">角色:</span>
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          disabled={roleLocked}
          className={`bg-paper/50 border border-ink/6 rounded-md px-2 py-1 text-[11px] text-ink focus:outline-none focus:border-coral/40 ${
            roleLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
          }`}
          title={roleLocked ? '会话已锁定角色' : '选择策划角色'}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1" />

      {/* Identity chip（演示模式/管理员） */}
      {identityChip && (
        <button
          onClick={identityChip.onClick}
          disabled={!identityChip.onClick}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
            identityChip.isDemo
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400'
              : 'border-ink/10 bg-paper/60 text-ink/55'
          } ${identityChip.onClick ? 'cursor-pointer' : 'cursor-default'}`}
          title={identityChip.isDemo ? '演示模式：使用平台免费额度。点击查看体验选项或主人登录' : `当前身份：${identityChip.label}`}
        >
          <UserRound size={12} />
          <span>{identityChip.label}</span>
          {identityChip.quota && (
            <span className="hidden sm:inline font-mono text-[10px] opacity-70">{identityChip.quota}</span>
          )}
        </button>
      )}

      {/* Status */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`w-2 h-2 rounded-full ${statusDot}`} />
        <span className="text-[11px] text-ink/40 font-mono">{statusText}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:bg-ink/5 hover:text-ink border border-ink/10 hover:border-coral/40 transition-colors"
          title="设置：我的模型（BYOK）、思考模式、平台全局配置"
        >
          <Settings size={13} />
          <span>设置</span>
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
        <button
          onClick={async () => {
            try {
              await fetch('/design/api/auth/sign-out', { method: 'POST', credentials: 'include' });
            } catch {
              // 即使登出接口失败也回到登录页，本地状态由整页刷新重置
            }
            window.location.href = '/design/login';
          }}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink/50 hover:bg-coral/10 hover:text-coral transition-colors"
          title="退出登录"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
