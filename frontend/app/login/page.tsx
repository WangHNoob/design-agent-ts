"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Gamepad2, Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("visitor@biaodev.site");
  const [password, setPassword] = useState("visitor2026");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        await signUp(email, password, name);
      }
      await signIn(email, password);
      // 整页跳转：AuthProvider 仅在挂载时探测会话，软导航会因上下文状态未刷新被 AuthGuard 弹回
      window.location.href = "/design";
    } catch (err) {
      setError(err instanceof Error ? err.message : "发生错误");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper dot-grid">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-coral text-white shadow-warm">
            <Gamepad2 size={32} strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            游戏策划工坊
          </h1>
          <p className="mt-1 text-sm text-ink/40">
            Game Designer Studio
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-ink/5 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
          {/* Email/Password Form */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === "login" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === "login" ? 20 : -20 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="mb-6 text-center text-lg font-semibold text-ink">
                {mode === "login" ? "登录" : "注册"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30"
                    />
                    <input
                      type="text"
                      placeholder="请输入真实姓名"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full rounded-xl border border-ink/10 bg-paper/50 py-3 pl-10 pr-4 text-sm text-ink placeholder:text-ink/30 focus:border-coral/50 focus:outline-none focus:ring-2 focus:ring-coral/20 transition-all"
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30"
                  />
                  <input
                    type="email"
                    placeholder="邮箱"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-xl border border-ink/10 bg-paper/50 py-3 pl-10 pr-4 text-sm text-ink placeholder:text-ink/30 focus:border-coral/50 focus:outline-none focus:ring-2 focus:ring-coral/20 transition-all"
                  />
                </div>

                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30"
                  />
                  <input
                    type="password"
                    placeholder="密码（至少8位）"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-ink/10 bg-paper/50 py-3 pl-10 pr-4 text-sm text-ink placeholder:text-ink/30 focus:border-coral/50 focus:outline-none focus:ring-2 focus:ring-coral/20 transition-all"
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-coral py-3 text-sm font-semibold text-white shadow-warm transition-all hover:bg-coral/90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "登录" : "注册"}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                {mode === "login" && (
                  <p className="text-center text-xs text-ink/35">
                    演示环境：已预填访客账号，直接点「登录」即可体验
                  </p>
                )}
              </form>
            </motion.div>
          </AnimatePresence>

          {/* 注册已在 nginx 层关闭（演示环境） */}
          <div className="mt-6 text-center text-xs text-ink/35">
            演示环境未开放注册 · 请使用预填访客账号直接登录
          </div>
        </div>
      </motion.div>
    </div>
  );
}
