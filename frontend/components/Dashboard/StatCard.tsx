'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  color: 'coral' | 'indigo' | 'success' | 'warning';
  delay?: number;
}

const colorMap = {
  coral: 'bg-coral/8 text-coral border-coral/15',
  indigo: 'bg-indigo/8 text-indigo border-indigo/15',
  success: 'bg-success/8 text-success border-success/15',
  warning: 'bg-warning/8 text-warning border-warning/15',
};

export default function StatCard({ title, value, subtitle, icon: Icon, color, delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`rounded-2xl border p-5 ${colorMap[color]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium opacity-60">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {subtitle && <p className="mt-0.5 text-[11px] opacity-50">{subtitle}</p>}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/60">
          <Icon size={20} />
        </div>
      </div>
    </motion.div>
  );
}
