'use client';

import { useState, useEffect } from 'react';
import { Server, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import SettingsNav from '@/components/SettingsNav';
import { getMCPStatus, type MCPStatus, type MCPToolInfo } from '@/lib/api';

export default function MCPSettingsPage() {
  const [mcpStatus, setMcpStatus] = useState<MCPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMCPStatus();
  }, []);

  const loadMCPStatus = async () => {
    try {
      const data = await getMCPStatus();
      setMcpStatus(data);
    } catch (err) {
      console.error('Failed to load MCP status:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTool = (toolName: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (mcpStatus) {
      setExpandedTools(new Set(mcpStatus.tools.map(t => t.name)));
    }
  };

  const collapseAll = () => {
    setExpandedTools(new Set());
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-ink/40">加载中...</div>
      </div>
    );
  }

  if (!mcpStatus) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <SettingsNav />
          <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
            <p className="text-ink/60">无法加载 MCP 状态</p>
          </div>
        </main>
        <DeerflowBadge />
      </div>
    );
  }

  // 按服务器分组工具
  const toolsByServer = mcpStatus.tools.reduce((acc, tool) => {
    if (!acc[tool.serverName]) {
      acc[tool.serverName] = [];
    }
    acc[tool.serverName].push(tool);
    return acc;
  }, {} as Record<string, MCPToolInfo[]>);

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <SettingsNav />

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo text-white">
              <Server size={20} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">MCP 管理</h1>
              <p className="text-sm text-ink/40">查看和管理 MCP 服务器及工具</p>
            </div>
          </div>
        </div>

        {/* 总体状态 */}
        <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">MCP 状态</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              mcpStatus.enabled
                ? 'bg-success/10 text-success'
                : 'bg-ink/10 text-ink/40'
            }`}>
              {mcpStatus.enabled ? '已启用' : '未启用'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-ink">{mcpStatus.servers.length}</div>
              <div className="text-sm text-ink/60">服务器数量</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-ink">{mcpStatus.toolCount}</div>
              <div className="text-sm text-ink/60">工具总数</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-ink">
                {mcpStatus.servers.filter(s => s.enabled).length}
              </div>
              <div className="text-sm text-ink/60">已启用服务器</div>
            </div>
          </div>
        </div>

        {/* 服务器列表 */}
        <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm mb-6">
          <h2 className="font-semibold text-ink mb-4">服务器配置</h2>
          <div className="space-y-3">
            {mcpStatus.servers.map((server) => (
              <div
                key={server.name}
                className="flex items-center justify-between rounded-xl border border-ink/8 p-4"
              >
                <div className="flex items-center gap-3">
                  <Server size={18} className="text-indigo" />
                  <div>
                    <div className="font-medium text-ink">{server.name}</div>
                    <div className="text-xs text-ink/60">传输方式: {server.transport}</div>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  server.enabled
                    ? 'bg-success/10 text-success'
                    : 'bg-ink/10 text-ink/40'
                }`}>
                  {server.enabled ? '已启用' : '未启用'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 工具列表 */}
        <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">工具列表</h2>
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="text-xs text-coral hover:text-coral/80 transition-colors"
              >
                全部展开
              </button>
              <span className="text-ink/30">|</span>
              <button
                onClick={collapseAll}
                className="text-xs text-coral hover:text-coral/80 transition-colors"
              >
                全部收起
              </button>
            </div>
          </div>

          {mcpStatus.tools.length === 0 ? (
            <p className="text-ink/60 text-center py-8">暂无工具</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(toolsByServer).map(([serverName, tools]) => (
                <div key={serverName}>
                  <div className="flex items-center gap-2 mb-2">
                    <Server size={16} className="text-indigo" />
                    <span className="font-medium text-ink">{serverName}</span>
                    <span className="text-xs text-ink/60">({tools.length} 个工具)</span>
                  </div>
                  <div className="space-y-2 ml-6">
                    {tools.map((tool) => {
                      const isExpanded = expandedTools.has(tool.name);
                      return (
                        <div
                          key={tool.name}
                          className="rounded-xl border border-ink/8 overflow-hidden"
                        >
                          <button
                            onClick={() => toggleTool(tool.name)}
                            className="w-full flex items-center justify-between p-4 hover:bg-ink/2 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Wrench size={16} className="text-coral" />
                              <div className="text-left">
                                <div className="font-medium text-ink">{tool.name}</div>
                                <div className="text-xs text-ink/60 mt-0.5">
                                  {tool.description}
                                </div>
                              </div>
                            </div>
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-ink/40" />
                            ) : (
                              <ChevronRight size={16} className="text-ink/40" />
                            )}
                          </button>
                          {isExpanded && (
                            <div className="border-t border-ink/8 p-4 bg-paper/30">
                              <div className="text-sm font-medium text-ink mb-2">参数定义</div>
                              <pre className="text-xs text-ink/80 bg-white rounded-lg p-3 overflow-x-auto">
                                {JSON.stringify(tool.parameters, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <DeerflowBadge />
    </div>
  );
}
