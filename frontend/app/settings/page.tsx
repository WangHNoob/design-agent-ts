'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings as SettingsIcon, ArrowLeft } from 'lucide-react';
import DeerflowBadge from '@/components/DeerflowBadge';
import SettingsNav, { SETTINGS_TABS, type SettingsTabId } from '@/components/SettingsNav';
import GeneralTab from '@/components/Settings/GeneralTab';
import PromptsTab from '@/components/Settings/PromptsTab';
import SkillsTab from '@/components/Settings/SkillsTab';
import WorkflowsTab from '@/components/Settings/WorkflowsTab';
import McpTab from '@/components/Settings/McpTab';

const TAB_IDS = SETTINGS_TABS.map((t) => t.id);

/**
 * 设置中心：单页五 Tab（通用 / 提示词 / 技能 / 工作流 / MCP）。
 * 旧子路由（/settings/prompts 等）重定向到 /settings?tab=…。
 * 页头只保留标题与返回入口，不挂站点导航（控制台/监控台等）。
 */
export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTabId>('general');

  // 深链恢复：/settings?tab=prompts
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q && (TAB_IDS as string[]).includes(q)) setTab(q as SettingsTabId);
  }, []);

  const selectTab = (next: SettingsTabId) => {
    setTab(next);
    // 同步地址栏（不触发导航），保住刷新/分享时的 Tab 状态
    const url = next === 'general' ? '/settings' : `/settings?tab=${next}`;
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="min-h-screen bg-paper">
      {/* 极简页头：仅标题 + 返回控制台 */}
      <header className="sticky top-0 z-50 border-b border-ink/5 bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral text-white shadow-warm">
              <SettingsIcon size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold leading-tight text-ink">设置</h1>
              <p className="text-[10px] tracking-widest text-ink/40 uppercase">Settings</p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/55 transition-colors hover:border-coral/40 hover:text-ink"
            title="返回控制台"
          >
            <ArrowLeft size={13} />
            返回控制台
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <SettingsNav activeTab={tab} onSelect={selectTab} />
        {tab === 'general' && <GeneralTab embedded />}
        {tab === 'prompts' && <PromptsTab embedded />}
        {tab === 'skills' && <SkillsTab embedded />}
        {tab === 'workflows' && <WorkflowsTab embedded />}
        {tab === 'mcp' && <McpTab embedded />}
      </main>
      <DeerflowBadge />
    </div>
  );
}
