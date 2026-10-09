'use client';

import { memo } from 'react';
import { ListChecks, Loader2 } from 'lucide-react';
import { useTaskStore, type ProgressPlanTask, type TaskState } from '@/lib/stores/taskStore';
import type { TimelineEntry } from './StepsTimeline';

interface Props {
  sessionId: string;
  tasks: ProgressPlanTask[];
}

/**
 * 任务行状态：timeline 里任务条目的四态 + 「规划了但还没开始」。
 * pending = 产出已生成、等待人工审阅（HITL 检查点暂停）。
 */
type RowStatus = 'unstarted' | 'running' | 'completed' | 'error' | 'pending';

const STATUS_META: Record<RowStatus, { label: string; iconClass: string; textClass: string }> = {
  unstarted: { label: '待开始', iconClass: 'bg-ink/20', textClass: 'text-ink/50' },
  running: { label: '进行中', iconClass: 'bg-amber-400 animate-pulse', textClass: 'text-amber-600' },
  completed: { label: '已完成', iconClass: 'bg-emerald-500', textClass: 'text-emerald-600' },
  error: { label: '失败', iconClass: 'bg-red-500', textClass: 'text-red-500' },
  pending: { label: '待审阅', iconClass: 'bg-coral', textClass: 'text-coral' },
};

/**
 * 展示签名：只由任务条目的 (taskId, status, durationMs) 组成。zustand 用
 * Object.is 去重——其余任意 store 更新（日志、流式文本、phase 时间线等）
 * 不再波及这张卡片（rerender-defer-reads 模式，同 TaskDock）。
 */
function timelineTaskSignature(task: TaskState | undefined): string {
  if (!task) return '';
  return task.timeline
    .filter((e) => e.type === 'task')
    .map((e) => `${e.taskId ?? e.id}|${e.status}|${e.durationMs ?? ''}`)
    .join('\n');
}

function ProgressCardInner({ sessionId, tasks }: Props) {
  const signature = useTaskStore((s) => timelineTaskSignature(s.tasks.get(sessionId)));
  // 签名变化必然伴随重渲染，渲染期直接读快照即是最新数据
  const entryByTaskId = new Map<string, TimelineEntry>();
  if (signature) {
    const task = useTaskStore.getState().tasks.get(sessionId);
    for (const e of task?.timeline ?? []) {
      if (e.type === 'task' && e.taskId) entryByTaskId.set(e.taskId, e);
    }
  }

  if (tasks.length === 0) return null;

  const rows = tasks.map((t) => {
    const entry = entryByTaskId.get(t.taskId);
    return { plan: t, entry, status: (entry?.status ?? 'unstarted') as RowStatus };
  });
  const doneCount = rows.filter((r) => r.status === 'completed' || r.status === 'pending').length;
  const anyRunning = rows.some((r) => r.status === 'running');

  return (
    <div className="rounded-xl border border-ink/8 bg-white px-4 py-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <ListChecks size={14} className="text-coral" />
        <span className="font-medium text-ink">任务进度</span>
        <span className="text-xs text-ink/60">{doneCount}/{tasks.length} 已完成</span>
        {anyRunning && <Loader2 size={12} className="animate-spin text-amber-500" />}
      </div>
      <div className="space-y-1.5">
        {rows.map(({ plan, entry, status }) => {
          const meta = STATUS_META[status];
          return (
            <div key={plan.taskId} className="flex items-start gap-2 min-w-0">
              <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${meta.iconClass}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 min-w-0">
                  {plan.agentName && (
                    <span className="shrink-0 text-xs font-medium text-coral">{plan.agentName}</span>
                  )}
                  <span className="truncate text-ink/90" title={plan.title}>{plan.title}</span>
                  <span className={`shrink-0 text-xs ${meta.textClass}`}>({meta.label})</span>
                  {entry?.durationMs !== undefined && (
                    <span className="shrink-0 text-xs text-ink/50 font-mono">
                      {(entry.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ProgressCard = memo(ProgressCardInner);
