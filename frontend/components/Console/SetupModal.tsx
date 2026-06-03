'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, KeyRound, Globe, Cpu, Save, Loader2 } from 'lucide-react';
import { saveSettings } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfigured: () => void;
  isFirstTime?: boolean;
}

export default function SetupModal({ open, onClose, onConfigured, isFirstTime }: Props) {
  const [provider, setProvider] = useState('anthropic');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [tavilyEnabled, setTavilyEnabled] = useState(false);
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('请输入 LLM API Key');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        modelProvider: provider,
        modelApiKey: apiKey.trim(),
      };
      if (modelName.trim()) payload.modelName = modelName.trim();
      if (baseUrl.trim()) payload.modelBaseUrl = baseUrl.trim();
      if (tavilyEnabled && tavilyApiKey.trim()) {
        payload.tavilyEnabled = true;
        payload.tavilyApiKey = tavilyApiKey.trim();
      }

      const res = await saveSettings(payload as Parameters<typeof saveSettings>[0]);
      if (res.success) {
        onConfigured();
      } else {
        setError((res as unknown as { error?: string }).error || '保存失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={isFirstTime ? undefined : onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl border border-ink/8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink/6">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-coral" />
                <h2 className="text-sm font-bold text-ink">
                  {isFirstTime ? '欢迎！请先配置 API Key' : 'API 配置'}
                </h2>
              </div>
              {!isFirstTime && (
                <button onClick={onClose} className="text-ink/30 hover:text-ink transition-colors">
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {isFirstTime && (
                <p className="text-xs text-ink/50 leading-relaxed">
                  配置 LLM API Key 后即可开始使用游戏策划 AI。支持 OpenAI、Anthropic 及兼容接口。
                </p>
              )}

              {/* Provider */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-ink/60">
                  <Cpu size={12} />
                  模型提供商
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:outline-none focus:border-coral/40"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                </select>
              </div>

              {/* Model Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink/60">模型名称（可选）</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder={provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'}
                  className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm placeholder:text-ink/25 focus:outline-none focus:border-coral/40"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-ink/60">
                  <KeyRound size={12} />
                  API Key <span className="text-coral">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm font-mono placeholder:text-ink/25 focus:outline-none focus:border-coral/40"
                />
              </div>

              {/* Base URL */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-ink/60">
                  <Globe size={12} />
                  自定义 Base URL（可选）
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm placeholder:text-ink/25 focus:outline-none focus:border-coral/40"
                />
              </div>

              {/* Divider */}
              <div className="border-t border-ink/6 pt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tavilyEnabled}
                    onChange={(e) => setTavilyEnabled(e.target.checked)}
                    className="rounded border-ink/20 text-coral focus:ring-coral/30"
                  />
                  <span className="text-xs font-medium text-ink/60">启用联网搜索 (Tavily)</span>
                </label>
              </div>

              {tavilyEnabled && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink/60">Tavily API Key</label>
                  <input
                    type="password"
                    value={tavilyApiKey}
                    onChange={(e) => setTavilyApiKey(e.target.value)}
                    placeholder="tvly-..."
                    className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm font-mono placeholder:text-ink/25 focus:outline-none focus:border-coral/40"
                  />
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-ink/6 bg-paper/50">
              {!isFirstTime && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-ink/50 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors"
                >
                  取消
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !apiKey.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-coral rounded-lg hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? '保存中...' : '保存并开始'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
