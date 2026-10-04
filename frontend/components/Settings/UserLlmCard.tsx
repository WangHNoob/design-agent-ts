'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Trash2, AlertTriangle } from 'lucide-react';

/**
 * 访客 BYOK 卡片：任何登录用户可配置自己的模型 Key（仅作用于自己的执行）。
 * Key 保存在服务端用户目录（不回传明文），并提供一键删除——
 * 体验完成后应立即删除。
 */
export default function UserLlmCard() {
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState('openai-compatible');
  const [modelName, setModelName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/llm', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d) => {
        if (d.configured) {
          setConfigured(true);
          setProvider(d.provider ?? 'openai-compatible');
          setModelName(d.modelName ?? '');
          setBaseUrl(d.baseUrl ?? '');
          setApiKeyMasked(d.apiKeyMasked ?? '');
        }
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!modelName.trim() || !apiKey.trim()) {
      setNotice({ kind: 'err', text: '模型名称和 API Key 为必填项' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, modelName: modelName.trim(), apiKey: apiKey.trim(), baseUrl: baseUrl.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setConfigured(true);
      setApiKeyMasked(d.apiKeyMasked ?? '****');
      setApiKey('');
      setNotice({ kind: 'ok', text: '已保存：你的执行将使用你自己的模型与 Key。' });
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/settings/llm', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfigured(false);
      setApiKeyMasked('');
      setNotice({ kind: 'ok', text: '已删除你的 Key。后续执行将回退到平台共享模型。' });
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : '删除失败' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-coral/25 bg-coral/[0.03] p-6 shadow-warm">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={18} className="text-coral" />
        <h2 className="font-semibold text-ink">我的模型（BYOK）</h2>
        {configured && <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-600 px-2 py-0.5">已配置 {apiKeyMasked}</span>}
      </div>
      <p className="text-xs text-ink/45 mb-4">
        配置你自己的模型 Key 后，你的执行将使用你自己的账号与额度，不消耗平台共享配额。
        <span className="text-coral font-medium">体验完成后请及时删除 Key（下方按钮）。</span>
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-ink/60 mb-1.5 block">供应商</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink focus:border-coral/50 focus:outline-none"
          >
            <option value="openai-compatible">OpenAI 兼容（DeepSeek / Kimi / 阶跃等）</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Claude (Anthropic)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-ink/60 mb-1.5 block">模型名称</label>
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="例如 step-5-preview / deepseek-chat"
            className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink/60 mb-1.5 block">API Key {configured && <span className="text-ink/30">（留空则不修改）</span>}</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={configured ? apiKeyMasked : 'sk-...'}
            className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink/60 mb-1.5 block">Base URL（OpenAI 兼容必填）</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none"
          />
        </div>
      </div>

      {notice && (
        <p className={`mt-3 text-sm ${notice.kind === 'ok' ? 'text-emerald-600' : 'text-coral'}`}>{notice.text}</p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-xl bg-coral px-5 py-2 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-50 transition-all"
        >
          {busy ? '处理中…' : '保存我的配置'}
        </button>
        {configured && (
          <button
            onClick={remove}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl border-2 border-ink/10 px-4 py-2 text-sm font-medium text-ink/60 hover:border-coral/40 hover:text-coral disabled:opacity-50 transition-all"
          >
            <Trash2 size={14} /> 删除我的 Key
          </button>
        )}
      </div>

      <p className="flex items-start gap-1.5 mt-4 text-[11px] text-ink/35">
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        Key 仅存储于本服务器、仅用于你的执行请求，不会展示给其他用户；但仍建议使用低额度子 Key，并在体验后删除。
      </p>
    </div>
  );
}
