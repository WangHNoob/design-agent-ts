'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
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
    <div className="min-h-screen">
      <Navbar />
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
