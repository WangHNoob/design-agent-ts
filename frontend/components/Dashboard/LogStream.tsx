'use client';

import { motion } from 'framer-motion';
import { Terminal, Info } from 'lucide-react';

export default function LogStream() {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
      <div className="mb-4 flex items-center gap-2">
        <Terminal size={16} className="text-ink/40" />
        <h3 className="text-sm font-medium text-ink/50">系统日志</h3>
      </div>
      <div className="rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed overflow-x-auto">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Info size={20} className="text-ink/30 mb-2" />
          <p className="text-ink/50">日志流需要后端可观测性（O11y）模块支持</p>
          <p className="text-ink/30 mt-1 text-[11px]">
            当前仅支持查看会话列表和 HITL 审阅状态
          </p>
        </div>
      </div>
    </div>
  );
}
