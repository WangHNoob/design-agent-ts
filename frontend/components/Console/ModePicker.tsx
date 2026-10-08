'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { MODE_META, MODE_ORDER } from '@/lib/modes';
import type { TaskMode } from '@/lib/stores/taskStore';

interface Props {
  mode: TaskMode;
  disabled?: boolean;
  onChange: (mode: TaskMode) => void;
}

/** 输入框内的执行策略选择器（一会话三模式，只对下一条消息生效）。
 *  形态对齐主流 agent（Copilot Ask/Edit/Agent、Cursor Agent/Ask）：紧凑下拉
 *  常驻 composer 左下，让"本会话可切三种策略"一眼可见。 */
export default function ModePicker({ mode, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = MODE_META[mode];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="执行策略（对下一条消息生效，会话上下文保留）"
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
          disabled
            ? 'cursor-not-allowed bg-ink/5 text-ink/50 opacity-60'
            : `bg-ink/5 hover:bg-ink/10 ${current.textClass}`
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${current.dotClass}`} />
        <current.icon size={11} />
        {current.label}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-40 mb-2 w-52 rounded-xl border border-ink/8 bg-white p-1 shadow-warm"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] text-ink/40">执行策略 · 对下一条消息生效</div>
          {MODE_ORDER.map((id) => {
            const meta = MODE_META[id];
            const active = id === mode;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  active ? 'bg-paper' : 'hover:bg-ink/5'
                }`}
              >
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${meta.chipClass}`}>
                  <meta.icon size={13} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                    {meta.label}
                    {active && <Check size={12} className="text-coral" />}
                  </span>
                  <span className="block text-[10px] text-ink/50">{meta.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
