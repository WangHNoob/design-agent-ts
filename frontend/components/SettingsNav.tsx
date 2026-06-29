'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, FileText, Zap, GitBranch, Server } from 'lucide-react';

const tabs = [
  { href: '/settings', label: '通用', icon: Settings },
  { href: '/settings/prompts', label: '提示词', icon: FileText },
  { href: '/settings/skills', label: '技能', icon: Zap },
  { href: '/settings/workflows', label: '工作流', icon: GitBranch },
  { href: '/settings/mcp', label: 'MCP', icon: Server },
];

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 rounded-xl bg-ink/5 p-1 mb-6">
      {tabs.map((tab) => {
        const isActive = tab.href === '/settings'
          ? pathname === '/settings'
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              isActive
                ? 'bg-white text-coral shadow-sm'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            <Icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
