'use client';

import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import { useTaskStore, type TaskMode } from '@/lib/stores/taskStore';

const MODE_LABELS: Record<TaskMode, string> = {
  design: '策划生成',
  query: '知识查询',
  table: '配表工具',
};

const MODE_COLORS: Record<TaskMode, string> = {
  design: 'bg-coral',
  query: 'bg-indigo',
  table: 'bg-emerald-500',
};

export default function TaskDock() {
  const router = useRouter();
  const store = useTaskStore();
  const runningTasks = store.getRunningTasks();

  if (runningTasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {runningTasks.map((task) => (
        <div
          key={task.sessionId}
          className="flex items-center gap-2 rounded-lg bg-white border border-ink/10 shadow-lg px-3 py-2 cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => {
            store.setActiveSession(task.mode, task.sessionId);
            router.push(`/${task.mode}`);
          }}
        >
          <div className={`w-2 h-2 rounded-full ${MODE_COLORS[task.mode]} animate-pulse`} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-ink/70">{MODE_LABELS[task.mode]}</span>
              <Loader2 size={10} className="animate-spin text-ink/40" />
            </div>
            <span className="text-[10px] text-ink/50 truncate max-w-[180px]">
              {task.requirement || '正在执行...'}
            </span>
          </div>
          <div className="text-[10px] text-ink/40 font-mono ml-1">{task.executionTime}</div>
          <button
            className="ml-1 p-0.5 rounded hover:bg-ink/5 text-ink/30 hover:text-red-500 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              store.cancelTask(task.sessionId);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
