'use client';

import { useState, useEffect, useMemo } from 'react';
import { KeyRound, Trash2, AlertTriangle, Brain, ShieldCheck } from 'lucide-react';

/** /api/settings/models 返回的模型元数据（models.dev 快照裁剪版） */
interface ModelMetaOption {
  id: string;
  name: string;
  reasoning: boolean;
  reasoningOptions: Array<{ type: 'toggle' | 'effort' | 'budget_tokens'; values?: string[]; min?: number }>;
  toolCall: boolean;
  context?: number;
  output?: number;
  costIn?: number;
  costOut?: number;
  deprecated?: boolean;
}

interface ProviderMetaOption {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string | null;
  models: ModelMetaOption[];
}

interface ModelsResponse {
  fetchedAt: string | null;
  builtinProviders: string[];
  providers: ProviderMetaOption[];
}

const REASONING_LEVELS: Array<{ value: 'minimal' | 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'minimal', label: '最轻' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

/** 注册表 effort 原值 → 中文标签；未收录的值原样显示 */
const EFFORT_LABELS: Record<string, string> = {
  none: '关闭',
  minimal: '最轻',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最大',
};

function effortLabel(value: string): string {
  return EFFORT_LABELS[value] ?? value;
}

/** 精确档位 → 统一五档（存入 reasoning.mode，供无元数据回退/预算换算） */
function effortToMode(value: string): 'minimal' | 'low' | 'medium' | 'high' {
  if (value === 'minimal' || value === 'none') return 'minimal';
  if (value === 'low') return 'low';
  if (value === 'medium') return 'medium';
  return 'high'; // high / xhigh / max 及未知高强度的兜底
}

const BUILTIN_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude (Anthropic)',
  'openai-compatible': 'OpenAI 兼容（自定义端点）',
};

function formatContext(n?: number): string {
  if (!n) return '';
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

/**
 * 访客 BYOK 卡片：任何登录用户可配置自己的模型 Key（仅作用于自己的执行）。
 * Key 服务端加密存储（不回传明文），一键删除。
 * provider/模型清单来自 models.dev 注册表快照；模型可手填注册表外名称。
 */
export default function UserLlmCard() {
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState('openai-compatible');
  const [modelName, setModelName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [reasoningEnabled, setReasoningEnabled] = useState(false);
  const [reasoningMode, setReasoningMode] = useState<'minimal' | 'low' | 'medium' | 'high'>('medium');
  /** 精确思考档位（注册表 effort 原值，如 max/xhigh/none）；仅 effort 型模型使用 */
  const [effortValue, setEffortValue] = useState<string | null>(null);
  const [budgetTokens, setBudgetTokens] = useState('');
  const [registry, setRegistry] = useState<ModelsResponse | null>(null);
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
          if (d.reasoning?.mode && d.reasoning.mode !== 'off') {
            setReasoningEnabled(true);
            if (['minimal', 'low', 'medium', 'high'].includes(d.reasoning.mode)) {
              setReasoningMode(d.reasoning.mode);
            }
            if (d.reasoning.effort) setEffortValue(d.reasoning.effort);
            if (d.reasoning.budgetTokens) setBudgetTokens(String(d.reasoning.budgetTokens));
          }
        }
      })
      .catch(() => {});
    fetch('/api/settings/models', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRegistry(d))
      .catch(() => {});
  }, []);

  const providerMetas = useMemo(() => registry?.providers ?? [], [registry]);
  const currentProviderMeta = useMemo(
    () => providerMetas.find((p) => p.id === provider) ?? null,
    [providerMetas, provider],
  );
  const modelMeta = useMemo(
    () => currentProviderMeta?.models.find((m) => m.id === modelName.trim()) ?? null,
    [currentProviderMeta, modelName],
  );
  const effortValues = useMemo(
    () => modelMeta?.reasoningOptions?.find((o) => o.type === 'effort')?.values ?? null,
    [modelMeta],
  );
  // 切换到 effort 型模型时，若已存档位不在该模型档位表内，取表中位档兜底
  useEffect(() => {
    if (effortValues?.length) {
      setEffortValue((prev) => (prev && effortValues.includes(prev) ? prev : effortValues[Math.ceil((effortValues.length - 1) / 2)]));
    }
  }, [effortValues]);
  const supportsBudget = modelMeta?.reasoningOptions?.some((o) => o.type === 'budget_tokens') ?? false;
  const supportsEffort = modelMeta?.reasoningOptions?.some((o) => o.type === 'effort') ?? false;

  const changeProvider = (next: string) => {
    setProvider(next);
    // 切供应商时同步预设 baseURL：当前为空或恰好是某家预设才自动替换，不覆盖手填地址
    const nextMeta = providerMetas.find((p) => p.id === next);
    const isPresetOrEmpty = !baseUrl || providerMetas.some((p) => p.baseUrl === baseUrl);
    if (isPresetOrEmpty) setBaseUrl(nextMeta?.baseUrl ?? '');
  };

  const save = async () => {
    if (!modelName.trim() || !apiKey.trim()) {
      setNotice({ kind: 'err', text: '模型名称和 API Key 为必填项' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const reasoning = reasoningEnabled
        ? {
            mode: effortValues?.length && effortValue
              ? effortToMode(effortValue)
              : reasoningMode,
            ...(effortValues?.length && effortValue ? { effort: effortValue } : {}),
            ...(supportsBudget && budgetTokens.trim() ? { budgetTokens: Number(budgetTokens.trim()) } : {}),
          }
        : { mode: 'off' as const };
      const res = await fetch('/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, modelName: modelName.trim(), apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), reasoning }),
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

  const builtinOptions = (registry?.builtinProviders ?? ['openai', 'anthropic', 'openai-compatible'])
    .filter((id) => !providerMetas.some((p) => p.id === id));

  return (
    <div className="rounded-2xl border border-coral/25 bg-coral/[0.03] p-6 shadow-warm">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={18} className="text-coral" />
        <h2 className="font-semibold text-ink">我的模型（BYOK）</h2>
        {configured && <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-600 px-2 py-0.5">已配置 {apiKeyMasked}</span>}
      </div>
      <p className="text-xs text-ink/45 mb-3">
        配置你自己的模型 Key 后，你的执行将使用你自己的账号与额度，不消耗平台免费额度（长策划生成任务推荐）。
      </p>
      {/* 安全提醒（醒目横幅）：加密存储说明 + 用后删 Key 建议 */}
      <div className="mb-4 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-amber-800">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <span><b>你的 Key 仅存储在本平台服务端</b>，已使用 AES-256-GCM 加密落盘，任何界面都只显示尾号预览、不回传明文。</span>
        </p>
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-amber-800">
          <Trash2 size={14} className="mt-0.5 shrink-0" />
          <span><b>体验完成后请及时删除 Key</b>（下方删除按钮，或到模型供应商控制台吊销），以防泄漏。</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-ink/60 mb-1.5 block">供应商</label>
          <select
            value={provider}
            onChange={(e) => changeProvider(e.target.value)}
            className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink focus:border-coral/50 focus:outline-none"
          >
            <optgroup label="通用协议">
              {builtinOptions.map((id) => (
                <option key={id} value={id}>{BUILTIN_LABELS[id] ?? id}</option>
              ))}
            </optgroup>
            {providerMetas.length > 0 && (
              <optgroup label="注册表供应商（自动端点）">
                {providerMetas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}（{p.models.length} 个模型）</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-ink/60 mb-1.5 block">
            模型名称
            {modelMeta && (
              <span className="ml-2 text-[11px] font-normal text-ink/40">
                上下文 {formatContext(modelMeta.context)}
                {modelMeta.reasoning ? ' · 支持思考' : ''}
                {modelMeta.costIn !== undefined ? ` · $${modelMeta.costIn}/$${modelMeta.costOut} 每百万` : ''}
              </span>
            )}
          </label>
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            list="byok-model-options"
            placeholder="输入或从列表选择模型"
            className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none"
          />
          <datalist id="byok-model-options">
            {(currentProviderMeta?.models ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </datalist>
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
          <label className="text-sm font-medium text-ink/60 mb-1.5 block">
            Base URL {currentProviderMeta?.baseUrl && <span className="text-ink/30">（默认已填 {currentProviderMeta.protocol === 'anthropic' ? 'Anthropic 兼容' : 'OpenAI 兼容'}端点）</span>}
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none"
          />
        </div>
      </div>

      {/* 思考（reasoning）控制 */}
      <div className="mt-4 rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain size={15} className="text-coral" />
            <span className="text-sm font-medium text-ink/70">思考模式（推理增强）</span>
            {modelMeta && !modelMeta.reasoning && (
              <span className="text-[11px] text-ink/40">（当前模型未标注支持思考，开启可能被拒绝）</span>
            )}
            {supportsEffort && <span className="text-[11px] text-ink/40">（档位型）</span>}
            {supportsBudget && <span className="text-[11px] text-ink/40">（预算型）</span>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reasoningEnabled}
            onClick={() => setReasoningEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${reasoningEnabled ? 'bg-coral' : 'bg-ink/15'}`}
          >
            <span className={`inline-block h-4.5 w-4.5 h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${reasoningEnabled ? 'translate-x-[24px]' : 'translate-x-[3px]'}`} />
          </button>
        </div>
        {reasoningEnabled && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {effortValues?.length ? (
              // 档位来自所选模型的注册表元数据（如 GLM 低/高/最大、GPT-5.1 关闭/最轻/低/中/高）
              <div className="flex rounded-lg border border-ink/10 overflow-hidden">
                {effortValues.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEffortValue(value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      effortValue === value ? 'bg-coral text-white' : 'bg-white text-ink/60 hover:bg-ink/5'
                    }`}
                  >
                    {effortLabel(value)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex rounded-lg border border-ink/10 overflow-hidden">
                {REASONING_LEVELS.map((lv) => (
                  <button
                    key={lv.value}
                    type="button"
                    onClick={() => setReasoningMode(lv.value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      reasoningMode === lv.value ? 'bg-coral text-white' : 'bg-white text-ink/60 hover:bg-ink/5'
                    }`}
                  >
                    {lv.label}
                  </button>
                ))}
              </div>
            )}
            {supportsBudget && (
              <label className="flex items-center gap-2 text-xs text-ink/50">
                思考预算（tokens，≥1024）
                <input
                  type="number"
                  min={1024}
                  value={budgetTokens}
                  onChange={(e) => setBudgetTokens(e.target.value)}
                  placeholder="按档位自动换算"
                  className="w-36 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-coral/50 focus:outline-none"
                />
              </label>
            )}
          </div>
        )}
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
        Key 经 AES-256-GCM 加密后仅存储于本服务器、仅用于你的执行请求，不会展示给其他用户；但仍建议使用低额度子 Key，并在体验后删除。
      </p>
    </div>
  );
}
