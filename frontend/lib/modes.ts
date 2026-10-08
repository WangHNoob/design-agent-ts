// 一会话三模式的共享元数据真源：ModePicker（输入框下拉）、WelcomeScreen（三模式
// pill）、TaskDock（运行卡片）、ChatBubble（产出模式徽标）统一从这里取。
// 注意：所有 Tailwind 类名必须是完整字面量——运行时拼接（`${x}/10`）会被 purge。
import type { LucideIcon } from 'lucide-react';
import { Search, Sparkles, ListChecks } from 'lucide-react';
import type { TaskMode } from '@/lib/stores/taskStore';

export interface ModeMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  /** 色点 / 圆点标记（bg-*） */
  dotClass: string;
  /** 选中态文字色（text-*） */
  textClass: string;
  /** 徽标 / 图标底配色（如 bg-coral/10 + text-coral，成对字面量） */
  chipClass: string;
}

export const MODE_ORDER: readonly TaskMode[] = ['design', 'query', 'table'];

export const MODE_META: Record<TaskMode, ModeMeta> = {
  design: {
    label: '策划生成',
    description: '多智能体协作生成完整策划方案',
    icon: Sparkles,
    dotClass: 'bg-coral',
    textClass: 'text-coral',
    chipClass: 'bg-coral/10 text-coral',
  },
  query: {
    label: '知识查询',
    description: '检索游戏策划知识库直接回答',
    icon: Search,
    dotClass: 'bg-indigo',
    textClass: 'text-indigo',
    chipClass: 'bg-indigo/10 text-indigo',
  },
  table: {
    label: '配表工具',
    description: '根据策划案生成游戏配置表',
    icon: ListChecks,
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-600',
    chipClass: 'bg-emerald-500/10 text-emerald-600',
  },
};

/** ?mode= 查询参数合法值（/query、/table 旧路径重定向的落点） */
export function normalizeMode(value: string | null): TaskMode | null {
  return value === 'design' || value === 'query' || value === 'table' ? value : null;
}
