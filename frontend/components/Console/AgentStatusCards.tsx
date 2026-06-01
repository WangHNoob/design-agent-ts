'use client';

import { useMemo, memo } from 'react';

export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
}

interface Props {
  agents: AgentStatus[];
}

const AGENT_DEFS: AgentStatus[] = [
  { id: 'director', name: '主策划', role: '任务规划与编排', status: 'pending', progress: 0 },
  { id: 'system', name: '系统策划', role: '系统架构与规则', status: 'pending', progress: 0 },
  { id: 'combat', name: '战斗策划', role: '战斗机制与公式', status: 'pending', progress: 0 },
  { id: 'numerical', name: '数值策划', role: '数值平衡与成长', status: 'pending', progress: 0 },
  { id: 'gameplay', name: '玩法策划', role: '玩法体验与关卡', status: 'pending', progress: 0 },
  { id: 'executive', name: '执行策划', role: '开发计划与排期', status: 'pending', progress: 0 },
  { id: 'qa', name: 'QA 策划', role: '质量审核与校验', status: 'pending', progress: 0 },
];

export function useAgentStatuses(rawAgents?: Partial<AgentStatus>[]): AgentStatus[] {
  return useMemo(() => {
    const map = new Map(rawAgents?.map((a) => [a.id, a]));
    return AGENT_DEFS.map((def) => {
      const raw = map.get(def.id);
      return { ...def, ...raw } as AgentStatus;
    });
  }, [rawAgents]);
}

export default function AgentStatusCards({ agents }: Props) {
  return (
    <div className="space-y-1.5">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}

const AgentCard = memo(function AgentCard({ agent }: { agent: AgentStatus }) {
  const statusMeta = {
    pending: { label: '等待', bg: 'bg-ink/5', text: 'text-ink/30', bar: 'bg-ink/10' },
    running: { label: '执行中', bg: 'bg-amber-50', text: 'text-amber-600', bar: 'bg-amber-400' },
    completed: { label: '完成', bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-400' },
    error: { label: '错误', bg: 'bg-red-50', text: 'text-red-600', bar: 'bg-red-400' },
  }[agent.status];

  return (
    <div className={`rounded-lg border px-2.5 py-2 transition-all ${statusMeta.bg} ${
      agent.status === 'running' ? 'border-amber-200' :
      agent.status === 'completed' ? 'border-emerald-200' :
      agent.status === 'error' ? 'border-red-200' :
      'border-transparent'
    }`}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 flex items-center justify-center bg-white rounded-md text-[10px] font-bold text-coral border border-ink/6 shrink-0">
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink truncate">{agent.name}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusMeta.text} ${statusMeta.bg}`}>
              {statusMeta.label}
            </span>
          </div>
          <p className="text-[10px] text-ink/30 truncate">{agent.role}</p>
        </div>
      </div>
      {agent.status === 'running' && (
        <div className="mt-1.5 h-1 bg-ink/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-coral to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(5, agent.progress)}%` }}
          />
        </div>
      )}
    </div>
  );
});
AgentCard.displayName = 'AgentCard';
