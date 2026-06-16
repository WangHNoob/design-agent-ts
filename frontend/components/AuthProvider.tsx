"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

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
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

async function fetchSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
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

  const refresh = useCallback(async () => {
    const u = await fetchSession();
    setUser(u);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setHydrated(true);
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: !hydrated || isLoading,
        isAuthenticated: !!user,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
