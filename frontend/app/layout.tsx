import type { Metadata } from 'next';
import './globals.css';
import TaskDock from '@/components/TaskDock';
import { AuthProvider } from '@/components/AuthProvider';
import { AuthGuard } from '@/components/AuthGuard';

export const metadata: Metadata = {
  title: '游戏策划工坊 | Game Designer',
  description: '多智能体游戏策划系统 — AI 驱动的游戏设计工作台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen dot-grid">
        <AuthProvider>
          <AuthGuard>
            {children}
            <TaskDock />
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
