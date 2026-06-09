"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authClient, useSession, signOut as authSignOut } from "@/lib/auth";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (session?.user) {
      setUser({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        role: (session.user as Record<string, unknown>).role as string | undefined,
      });
    } else {
      setUser(null);
    }
  }, [session]);

  const logout = useCallback(async () => {
    await authSignOut();
    setUser(null);
    window.location.href = "/login";
  }, []);

  const refresh = useCallback(async () => {
    await authClient.getSession();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isPending,
        isAuthenticated: !!user,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
