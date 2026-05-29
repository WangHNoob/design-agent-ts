'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock, BarChart3, Server } from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import StatCard from '@/components/Dashboard/StatCard';
import ExecutionTimeline from '@/components/Dashboard/ExecutionTimeline';
import LogStream from '@/components/Dashboard/LogStream';
import { checkHealth } from '@/lib/api';

export default function DashboardPage() {
  const [health, setHealth] = useState<'online' | 'offline' | 'checking'>('checking');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await checkHealth();
        setHealth(res.status === 'ok' ? 'online' : 'offline');
      } catch {
        setHealth('offline');
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

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
            value="3"
            subtitle="当前正在处理的会话"
            icon={Activity}
            color="indigo"
            delay={0.1}
          />
          <StatCard
            title="今日请求"
            value="47"
            subtitle="较昨日 +12%"
            icon={BarChart3}
            color="coral"
            delay={0.2}
          />
          <StatCard
            title="平均响应"
            value="8.3s"
            subtitle="最近 10 次执行"
            icon={Clock}
            color="warning"
            delay={0.3}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Timeline - takes 3 columns */}
          <div className="lg:col-span-3">
            <ExecutionTimeline />
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { name: 'DirectorAgent', status: 'idle', tasks: 0 },
              { name: 'CombatDesigner', status: 'running', tasks: 1 },
              { name: 'GameplayDesigner', status: 'idle', tasks: 0 },
              { name: 'NumericalPlanner', status: 'idle', tasks: 0 },
              { name: 'QAPlanner', status: 'idle', tasks: 0 },
              { name: 'SystemDesigner', status: 'idle', tasks: 0 },
            ].map((agent, i) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.08 }}
                className="flex items-center justify-between rounded-xl border border-ink/6 bg-white p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{agent.name}</p>
                  <p className="text-[11px] text-ink/40">
                    {agent.tasks > 0 ? `${agent.tasks} 个任务进行中` : '无任务'}
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    agent.status === 'running'
                      ? 'bg-coral/10 text-coral'
                      : 'bg-success/10 text-success'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      agent.status === 'running' ? 'bg-coral animate-pulse' : 'bg-success'
                    }`}
                  />
                  {agent.status === 'running' ? '执行中' : '空闲'}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </main>

      <DeerflowBadge />
    </div>
  );
}
