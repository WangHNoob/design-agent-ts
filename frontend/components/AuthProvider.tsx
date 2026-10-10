"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { demoCreateSession } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role?: string;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** 当前会话是否为匿名演示账号（打开平台自动登录的访客身份）。 */
  isDemoUser: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isDemoUser: false,
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/** 匿名演示账号邮箱形如 anon-<uuid>@demo.local（服务端 DEMO_ANON_EMAIL_DOMAIN）。 */
function isDemoEmail(email: string | undefined | null): boolean {
  return !!email?.endsWith("@demo.local");
}

async function fetchSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/design/api/auth/get-session", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      image: data.user.image,
      role: data.user.role,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  // 演示自动登录每次页面加载只尝试一次（登录失败/未开启不反复打接口）
  const autoLoginTriedRef = useRef(false);

  const refresh = useCallback(async () => {
    let u = await fetchSession();
    // 演示模式自动登录：无会话且不在登录页时，为当前浏览器签发匿名演示
    // 会话后重查。isLoading 保持 true 直到流程结束，AuthGuard 不会中途弹登录页。
    if (!u && !autoLoginTriedRef.current) {
      autoLoginTriedRef.current = true;
      if (!window.location.pathname.startsWith("/design/login")) {
        const ok = await demoCreateSession();
        if (ok) u = await fetchSession();
      }
    }
    setUser(u);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setHydrated(true);
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/design/api/auth/sign-out", { method: "POST", credentials: "include" });
    setUser(null);
    window.location.href = "/design/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: !hydrated || isLoading,
        isAuthenticated: !!user,
        isDemoUser: isDemoEmail(user?.email),
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
