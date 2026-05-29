'use client';

import { motion } from 'framer-motion';
import { Lightbulb, Search, Table } from 'lucide-react';

const modes = [
  { value: 'design' as const, label: '完整设计', icon: Lightbulb, desc: '技能匹配 → 任务规划 → 执行 → 整合' },
  { value: 'query' as const, label: '知识查询', icon: Search, desc: '直接查询知识库返回结果' },
  { value: 'table' as const, label: '配表生成', icon: Table, desc: '生成游戏配置表格' },
];

interface Props {
  value: 'design' | 'query' | 'table';
  onChange: (mode: 'design' | 'query' | 'table') => void;
}

export default function ModeSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-ink/60">执行模式</label>
      <div className="flex flex-wrap gap-3">
        {modes.map((mode) => {
          const isActive = value === mode.value;
          const Icon = mode.icon;
          return (
            <motion.button
              key={mode.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onChange(mode.value)}
              className={`relative flex flex-1 min-w-[140px] items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 ${
                isActive
                  ? 'border-coral bg-coral/5'
                  : 'border-ink/8 bg-white hover:border-ink/15'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isActive ? 'bg-coral text-white' : 'bg-ink/5 text-ink/40'
                }`}
              >
                <Icon size={18} />
              </div>
              <div>
                <div
                  className={`text-sm font-semibold ${
                    isActive ? 'text-coral' : 'text-ink'
                  }`}
                >
                  {mode.label}
                </div>
                <div className="text-[11px] text-ink/40 leading-tight mt-0.5">
                  {mode.desc}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
