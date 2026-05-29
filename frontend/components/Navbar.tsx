'use client';

import { motion } from 'framer-motion';
import { LayoutDashboard, Gamepad2, Settings, ClipboardCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { href: '/', label: '控制台', icon: Gamepad2 },
  { href: '/dashboard', label: '监控台', icon: LayoutDashboard },
  { href: '/review', label: '审阅中心', icon: ClipboardCheck },
  { href: '/settings', label: '设置', icon: Settings },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="sticky top-0 z-50 border-b border-ink/5 bg-paper/80 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral text-white shadow-warm">
            <Gamepad2 size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold leading-tight text-ink">
              游戏策划工坊
            </h1>
            <p className="text-[10px] tracking-widest text-ink/40 uppercase">
              Game Designer Studio
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-coral'
                    : 'text-ink/50 hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 rounded-lg bg-coral/10"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-coral/30 to-transparent" />
    </motion.nav>
  );
}
