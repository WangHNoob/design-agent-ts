'use client';

import { ChevronDown, User, Swords, Puzzle, Calculator, ShieldCheck, Settings } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const roles = [
  { value: 'chief_designer', label: '主策划', icon: User, desc: '统筹全局设计方向' },
  { value: 'combat_designer', label: '战斗策划', icon: Swords, desc: '核心战斗系统设计' },
  { value: 'gameplay_designer', label: '玩法策划', icon: Puzzle, desc: '玩法机制与流程设计' },
  { value: 'numerical_planner', label: '数值策划', icon: Calculator, desc: '数值平衡与成长曲线' },
  { value: 'qa_planner', label: 'QA策划', icon: ShieldCheck, desc: '测试与质量保证' },
  { value: 'system_designer', label: '系统策划', icon: Settings, desc: '系统功能架构设计' },
];

interface Props {
  value: string;
  onChange: (role: string) => void;
}

export default function RoleSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = roles.find((r) => r.value === value) || roles[0];
  const SelectedIcon = selected.icon;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-ink/60">策划角色</label>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-xl border-2 border-ink/8 bg-white px-4 py-3 text-left transition-all hover:border-ink/15"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo/10 text-indigo">
              <SelectedIcon size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">{selected.label}</div>
              <div className="text-[11px] text-ink/40">{selected.desc}</div>
            </div>
          </div>
          <ChevronDown
            size={16}
            className={`text-ink/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute z-20 mt-2 w-full rounded-xl border border-ink/8 bg-white py-2 shadow-warm-lg">
            {roles.map((role) => {
              const Icon = role.icon;
              const isSelected = value === role.value;
              return (
                <button
                  key={role.value}
                  onClick={() => {
                    onChange(role.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink/5 ${
                    isSelected ? 'bg-coral/5' : ''
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-coral/10 text-coral' : 'bg-ink/5 text-ink/40'
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div>
                    <div
                      className={`text-sm font-medium ${
                        isSelected ? 'text-coral' : 'text-ink'
                      }`}
                    >
                      {role.label}
                    </div>
                    <div className="text-[11px] text-ink/40">{role.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
