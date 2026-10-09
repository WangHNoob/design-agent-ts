'use client';

import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import { useTaskStore, type TaskState } from '@/lib/stores/taskStore';
import { MODE_META } from '@/lib/modes';

/** 运行中卡片的展示签名：基元字符串让 zustand 用 Object.is 去重——
 *  只有运行任务的关键字段（含每秒计时）变化才重渲染，其余任意 store
 *  更新（日志、流式文本等）不再波及这个挂在根布局里的组件
 *  （rerender-defer-reads：不要订阅渲染之外才消费的状态）。 */
function runningTasksSignature(tasks: TaskState[]) {
  return tasks
    .map((t) => `${t.sessionId}|${t.mode}|${t.requirement}|${t.executionTime}`)
    .join('\n');
}

export default function TaskDock() {
  const router = useRouter();
  const signature = useTaskStore((s) => runningTasksSignature(s.getRunningTasks()));
  // 渲染期直接读快照：签名变化必然伴随重渲染，读到的就是最新数据
  // 防御性按 sessionId 去重：历史条目残留时同一会话不渲染多张卡片
  const runningTasks = signature
    ? Array.from(
        new Map(useTaskStore.getState().getRunningTasks().map((t) => [t.sessionId, t])).values(),
      )
    : [];

  if (runningTasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {runningTasks.map((task) => (
        <div
          key={task.sessionId}
          className="flex items-center gap-2 rounded-lg bg-white border border-ink/10 shadow-lg px-3 py-2 cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => {
            // 一会话三模式：统一控制台在 /design，卡片只激活会话
            useTaskStore.getState().setActiveSession(task.sessionId);
            router.push('/design');
          }}
        >
          <div className={`w-2 h-2 rounded-full ${MODE_META[task.mode].dotClass} animate-pulse`} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-ink/70">{MODE_META[task.mode].label}</span>
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
              useTaskStore.getState().cancelTask(task.sessionId);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
