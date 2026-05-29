'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Save, RotateCcw, Database, Cpu, MessageSquare, Globe, KeyRound, Link2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import { getSettings, saveSettings, getTavilyStatus, type TavilyStatus } from '@/lib/api';

interface AppSettings {
  modelProvider: string;
  modelName: string;
  modelApiKey: string;
  modelBaseUrl: string;
  temperature: number;
  maxTokens: number;
  hitlEnabled: boolean;
  maxClarifyRounds: number;
  streamingEnabled: boolean;
  autoSaveSessions: boolean;
  tavilyEnabled: boolean;
  tavilyApiKey: string;
}

const defaultSettings: AppSettings = {
  modelProvider: 'openai',
  modelName: 'gpt-4o',
  modelApiKey: '',
  modelBaseUrl: '',
  temperature: 0.7,
  maxTokens: 4096,
  hitlEnabled: false,
  maxClarifyRounds: 3,
  streamingEnabled: true,
  autoSaveSessions: true,
  tavilyEnabled: false,
  tavilyApiKey: '',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tavilyStatus, setTavilyStatus] = useState<TavilyStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [backendSettings, status] = await Promise.all([
          getSettings(),
          getTavilyStatus().catch(() => null),
        ]);
        setTavilyStatus(status);
        setSettings((prev) => ({
          ...prev,
          modelProvider: backendSettings.modelProvider ?? prev.modelProvider,
          modelName: backendSettings.modelName ?? prev.modelName,
          modelApiKey: '', // never prefill sensitive keys
          modelBaseUrl: backendSettings.modelBaseUrl ?? prev.modelBaseUrl,
          temperature: backendSettings.temperature ?? prev.temperature,
          maxTokens: backendSettings.maxTokens ?? prev.maxTokens,
          hitlEnabled: backendSettings.hitlEnabled ?? prev.hitlEnabled,
          maxClarifyRounds: backendSettings.maxClarifyRounds ?? prev.maxClarifyRounds,
          streamingEnabled: backendSettings.streamingEnabled ?? prev.streamingEnabled,
          autoSaveSessions: backendSettings.autoSaveSessions ?? prev.autoSaveSessions,
          tavilyEnabled: backendSettings.tavilyEnabled ?? prev.tavilyEnabled,
          tavilyApiKey: '', // never prefill sensitive keys
        }));
      } catch {
        const stored = localStorage.getItem('game-designer-settings');
        if (stored) {
          try {
            setSettings({ ...defaultSettings, ...JSON.parse(stored) });
          } catch {
            // ignore
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaved(false);
    try {
      const payload: Partial<AppSettings> = {
        modelProvider: settings.modelProvider,
        modelName: settings.modelName,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        hitlEnabled: settings.hitlEnabled,
        maxClarifyRounds: settings.maxClarifyRounds,
        streamingEnabled: settings.streamingEnabled,
        autoSaveSessions: settings.autoSaveSessions,
        tavilyEnabled: settings.tavilyEnabled,
      };
      // Only send API keys if user has entered something
      if (settings.modelApiKey) payload.modelApiKey = settings.modelApiKey;
      if (settings.modelBaseUrl) payload.modelBaseUrl = settings.modelBaseUrl;
      if (settings.tavilyApiKey) payload.tavilyApiKey = settings.tavilyApiKey;

      await saveSettings(payload);
      const status = await getTavilyStatus().catch(() => null);
      if (status) setTavilyStatus(status);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      localStorage.setItem('game-designer-settings', JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    localStorage.removeItem('game-designer-settings');
  };

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const Switch = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-coral' : 'bg-ink/15'
      }`}
    >
      <motion.div
        className="h-4 w-4 rounded-full bg-white shadow-sm"
        animate={{ x: value ? 22 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-ink/40">加载设置中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo text-white">
              <Settings size={20} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">系统设置</h1>
              <p className="text-sm text-ink/40">配置 LLM 模型、联网搜索、HITL 策略与交互偏好</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
          {/* LLM Config */}
          <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
            <div className="flex items-center gap-2 mb-5">
              <KeyRound size={18} className="text-coral" />
              <h2 className="font-semibold text-ink">LLM 配置</h2>
              <span className="ml-2 text-[11px] text-ink/30">修改后实时生效，无需重启</span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink/60 mb-1.5 block">供应商</label>
                <select
                  value={settings.modelProvider}
                  onChange={(e) => update('modelProvider', e.target.value)}
                  className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink focus:border-coral/50 focus:outline-none transition-all"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai-compatible">OpenAI 兼容</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-ink/60 mb-1.5 block">模型名称</label>
                <input
                  value={settings.modelName}
                  onChange={(e) => update('modelName', e.target.value)}
                  placeholder="gpt-4o / claude-3-5-sonnet / ..."
                  className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                  API Key
                </label>
                <input
                  type="password"
                  value={settings.modelApiKey}
                  onChange={(e) => update('modelApiKey', e.target.value)}
                  placeholder="sk-... 或 输入新值覆盖当前配置"
                  className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-ink/60 mb-1.5 block flex items-center gap-1">
                  <Link2 size={12} />
                  请求地址 Base URL（可选）
                </label>
                <input
                  value={settings.modelBaseUrl}
                  onChange={(e) => update('modelBaseUrl', e.target.value)}
                  placeholder="https://api.openai.com/v1  或自定义代理地址"
                  className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                />
                <p className="mt-1 text-[11px] text-ink/30">
                  OpenAI 兼容供应商必须填写，如本地 Ollama、Azure OpenAI、第三方代理等
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                  Temperature: {settings.temperature}
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={settings.temperature}
                  onChange={(e) => update('temperature', parseFloat(e.target.value))}
                  className="w-full accent-coral"
                />
                <div className="flex justify-between text-[10px] text-ink/30 mt-1">
                  <span>精确</span>
                  <span>平衡</span>
                  <span>创意</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-ink/60 mb-1.5 block">最大 Token</label>
                <input
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => update('maxTokens', parseInt(e.target.value))}
                  className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink focus:border-coral/50 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Web Search (Tavily) */}
          <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
            <div className="flex items-center gap-2 mb-5">
              <Globe size={18} className="text-coral" />
              <h2 className="font-semibold text-ink">联网搜索 (Tavily)</h2>
              {tavilyStatus?.connected && (
                <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                  已连接
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">启用 Tavily 联网搜索</p>
                  <p className="text-xs text-ink/40">Agent 可在知识库不足时搜索互联网补充信息</p>
                </div>
                <Switch value={settings.tavilyEnabled} onChange={(v) => update('tavilyEnabled', v)} />
              </div>

              <div>
                <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                  Tavily API Key
                  {tavilyStatus?.preview && (
                    <span className="ml-2 text-xs text-ink/30">当前: {tavilyStatus.preview}</span>
                  )}
                </label>
                <input
                  type="password"
                  value={settings.tavilyApiKey}
                  onChange={(e) => update('tavilyApiKey', e.target.value)}
                  placeholder={tavilyStatus?.apiKeySet ? '已配置，输入新值可覆盖' : 'tvly-...'}
                  className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                />
                <p className="mt-1 text-[11px] text-ink/30">
                  获取免费 Key: <a href="https://tavily.com" target="_blank" rel="noreferrer" className="text-coral hover:underline">tavily.com</a>
                </p>
              </div>
            </div>
          </div>

          {/* HITL & Interaction */}
          <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
            <div className="flex items-center gap-2 mb-5">
              <MessageSquare size={18} className="text-coral" />
              <h2 className="font-semibold text-ink">HITL 与交互</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">启用 HITL 审阅</p>
                  <p className="text-xs text-ink/40">在关键节点暂停等待人工确认</p>
                </div>
                <Switch value={settings.hitlEnabled} onChange={(v) => update('hitlEnabled', v)} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">流式输出</p>
                  <p className="text-xs text-ink/40">实时显示 Agent 响应内容</p>
                </div>
                <Switch value={settings.streamingEnabled} onChange={(v) => update('streamingEnabled', v)} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">自动保存会话</p>
                  <p className="text-xs text-ink/40">每次执行后自动保存到历史记录</p>
                </div>
                <Switch value={settings.autoSaveSessions} onChange={(v) => update('autoSaveSessions', v)} />
              </div>

              <div>
                <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                  最大澄清轮数: {settings.maxClarifyRounds}
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={settings.maxClarifyRounds}
                  onChange={(e) => update('maxClarifyRounds', parseInt(e.target.value))}
                  className="w-full accent-coral"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
            <div className="flex items-center gap-2 mb-5">
              <Database size={18} className="text-coral" />
              <h2 className="font-semibold text-ink">数据管理</h2>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white hover:bg-coral/90 transition-colors"
              >
                <Save size={15} />
                {saved ? '已保存' : '保存设置'}
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 rounded-xl border border-ink/10 px-5 py-2.5 text-sm font-medium text-ink/60 hover:bg-ink/5 transition-colors"
              >
                <RotateCcw size={15} />
                恢复默认
              </button>
            </div>
          </div>
        </motion.div>
      </main>

      <DeerflowBadge />
    </div>
  );
}
