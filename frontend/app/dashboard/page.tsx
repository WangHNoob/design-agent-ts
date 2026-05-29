'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock, BarChart3, Server, AlertCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import StatCard from '@/components/Dashboard/StatCard';
import ExecutionTimeline from '@/components/Dashboard/ExecutionTimeline';
import LogStream from '@/components/Dashboard/LogStream';
import { checkHealth, listSessions, type SessionMeta } from '@/lib/api';

export default function DashboardPage() {
  const [health, setHealth] = useState<'online' | 'offline' | 'checking'>('checking');
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await checkHealth();
        setHealth(res.status === 'ok' ? 'online' : 'offline');
      } catch {
        setHealth('offline');
      }
    };

    const loadSessions = async () => {
      try {
        const res = await listSessions(100, 0);
        setSessions(res.sessions);
        setActiveCount(res.sessions.filter((s) => s.status === 'running').length);
      } catch {
        setSessions([]);
        setActiveCount(0);
      }
    };

    const init = async () => {
      await Promise.all([check(), loadSessions()]);
      setLoading(false);
    };

    init();

    const interval = setInterval(() => {
      check();
      loadSessions();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const failedCount = sessions.filter((s) => s.status === 'failed').length;

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-display text-3xl font-bold text-ink">系统监控台</h1>
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                health === 'online'
                  ? 'bg-success/10 text-success'
                  : health === 'offline'
                  ? 'bg-coral/10 text-coral'
                  : 'bg-warning/10 text-warning'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health === 'online'
                    ? 'bg-success animate-pulse'
                    : health === 'offline'
                    ? 'bg-coral'
                    : 'bg-warning animate-pulse'
                }`}
              />
              {health === 'online' ? '系统在线' : health === 'offline' ? '系统离线' : '检测中...'}
            </div>
          </div>
          <p className="text-sm text-ink/40">实时监控多智能体游戏策划系统的运行状态</p>
        </motion.div>

        {/* Stat Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="系统状态"
            value={health === 'online' ? '正常' : health === 'offline' ? '异常' : '检测中'}
            subtitle="API 服务健康检查"
            icon={Server}
            color={health === 'online' ? 'success' : 'coral'}
            delay={0}
          />
          <StatCard
            title="活跃会话"
            value={loading ? '—' : String(activeCount)}
            subtitle={loading ? '' : `共 ${sessions.length} 个会话`}
            icon={Activity}
            color="indigo"
            delay={0.1}
          />
          <StatCard
            title="已完成"
            value={loading ? '—' : String(completedCount)}
            subtitle={failedCount > 0 ? `${failedCount} 个失败` : '今日执行统计'}
            icon={BarChart3}
            color="coral"
            delay={0.2}
          />
          <StatCard
            title="平均响应"
            value="—"
            subtitle="可观测性模块待实现"
            icon={Clock}
            color="warning"
            delay={0.3}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Timeline - takes 3 columns */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
                <p className="text-sm text-ink/40">加载会话数据...</p>
              </div>
            ) : sessions.length > 0 ? (
              <ExecutionTimeline sessions={sessions.slice(0, 5)} />
            ) : (
              <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
                <h3 className="mb-3 text-sm font-medium text-ink/50">最近执行流程</h3>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle size={32} className="text-ink/20 mb-3" />
                  <p className="text-sm text-ink/40">暂无执行记录</p>
                  <p className="text-xs text-ink/25 mt-1">在控制台发起一次策划任务后即可查看</p>
                </div>
              </div>
            )}
          </div>

          {/* Log Stream - takes 2 columns */}
          <div className="lg:col-span-2">
            <LogStream />
          </div>
        </div>

        {/* Agent Status Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6"
        >
          <h3 className="mb-4 text-sm font-medium text-ink/50">Agent 状态概览</h3>
          {activeCount > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sessions
                .filter((s) => s.status === 'running')
                .slice(0, 6)
                .map((session, i) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.08 }}
                    className="flex items-center justify-between rounded-xl border border-ink/6 bg-white p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{session.role}</p>
                      <p className="text-[11px] text-ink/40 truncate max-w-[180px]">{session.requirement}</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium bg-coral/10 text-coral">
                      <span className="h-1.5 w-1.5 rounded-full bg-coral animate-pulse" />
                      执行中
                    </div>
                  </motion.div>
                ))}
            </div>
          ) : (
            <div className="rounded-xl border border-ink/6 bg-white p-6 text-center">
              <p className="text-sm text-ink/40">暂无运行中的 Agent</p>
              <p className="text-xs text-ink/25 mt-1">实时 Agent 状态需要后端可观测性（O11y）模块支持</p>
            </div>
          )}
        </motion.div>
      </main>

      <DeerflowBadge />
    </div>
  );
}
