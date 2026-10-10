'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, Sparkles, KeyRound, Lock, ShieldCheck, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { demoOwnerLogin, type DemoStatus } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 免费额度状态（用于文案展示，可为 null）。 */
  status?: DemoStatus | null;
}

const QUOTA_TEXT = (status?: DemoStatus | null) =>
  status?.quotaEnabled && status.limit
    ? `每日免费额度 ${status.limit.toLocaleString()} tokens（所有访客共享，零点重置）`
    : '每日免费额度（所有访客共享，零点重置）';

/**
 * 访客进入控制台的选择弹窗：免费额度体验 / 配置自己的 LLM / 主人登录。
 * 关闭选择会被 localStorage 记住（demo-choice-seen），可从导航栏重新打开。
 */
export default function DemoChoiceModal({ open, onClose, status }: Props) {
  const { refresh } = useAuth();
  const [showOwner, setShowOwner] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleOwnerLogin = async () => {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await demoOwnerLogin(password);
      await refresh();
      onClose();
      // 管理员会话已建立，整页刷新让全局配置等 admin 能力立即生效
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-ink/8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-ink/6 bg-paper/60">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral text-white shadow-warm">
                <Gamepad2 size={20} strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-ink">欢迎来到游戏策划工坊</h2>
                <p className="text-[11px] text-ink/45">你已进入演示模式，选择体验方式</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* 选择 */}
              <button
                onClick={onClose}
                className="w-full flex items-start gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-left hover:border-coral/40 hover:bg-coral/[0.03] transition-colors"
              >
                <Sparkles size={18} className="mt-0.5 text-coral shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-ink">使用免费额度体验</span>
                  <span className="block mt-0.5 text-[11px] leading-relaxed text-ink/50">
                    {QUOTA_TEXT(status)}。长策划生成任务较耗额度，可能不够用。
                  </span>
                </span>
              </button>

              <a
                href="/design/settings"
                className="w-full flex items-start gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-left hover:border-coral/40 hover:bg-coral/[0.03] transition-colors"
              >
                <KeyRound size={18} className="mt-0.5 text-coral shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-ink">配置我自己的 LLM Key</span>
                  <span className="block mt-0.5 text-[11px] leading-relaxed text-ink/50">
                    使用自己的模型与额度，不受免费额度限制，支持思考模式控制。推荐长任务使用。
                  </span>
                </span>
              </a>

              {/* 安全提醒 */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 space-y-1.5">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-800">
                  <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                  你的 Key 仅存储在服务端，已使用 AES-256-GCM 加密落盘，界面只显示尾号预览。
                </p>
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-800">
                  <Trash2 size={13} className="mt-0.5 shrink-0" />
                  体验完成后，请及时在模型供应商控制台或本平台「设置 → 我的模型」删除 Key，以防泄漏。
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              {/* 主人登录（默认折叠） */}
              <div className="pt-1">
                <button
                  onClick={() => setShowOwner((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-ink/35 hover:text-ink/60 transition-colors"
                >
                  <ChevronDown size={12} className={showOwner ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  主人登录
                </button>
                {showOwner && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/25" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleOwnerLogin(); }}
                        placeholder="管理员密码"
                        autoFocus
                        className="w-full rounded-lg border border-ink/10 bg-paper pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-coral/40"
                      />
                    </div>
                    <button
                      onClick={() => void handleOwnerLogin()}
                      disabled={busy || !password}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-coral rounded-lg hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                      登录
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
