'use client';

import { Settings, FileText, Zap, GitBranch, Server } from 'lucide-react';

export type SettingsTabId = 'general' | 'prompts' | 'skills' | 'workflows' | 'mcp';

export const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; icon: typeof Settings }> = [
  { id: 'general', label: '通用', icon: Settings },
  { id: 'prompts', label: '提示词', icon: FileText },
  { id: 'skills', label: '技能', icon: Zap },
  { id: 'workflows', label: '工作流', icon: GitBranch },
  { id: 'mcp', label: 'MCP', icon: Server },
];

interface Props {
  activeTab: SettingsTabId;
  onSelect: (tab: SettingsTabId) => void;
}

/** 设置页 Tab 栏（单页受控组件；旧子路由已重定向到 /settings?tab=…） */
export default function SettingsNav({ activeTab, onSelect }: Props) {
  return (
    <div className="flex gap-1 rounded-xl bg-ink/5 p-1 mb-6">
      {SETTINGS_TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              isActive
                ? 'bg-white text-coral shadow-sm'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            <Icon size={14} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
