"use client";

import { useAuth } from "@/components/AuthProvider";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const PUBLIC_PATHS = ["/login", "/register"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // During SSR (not mounted), render children directly to avoid
  // flashing a loading spinner on every page.
  if (!mounted) {
    return <>{children}</>;
  }

  // Client-side: show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-coral border-t-transparent" />
          <p className="text-sm text-ink/50">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isPublic) {
    router.replace("/login");
    return null;
  }

  return <>{children}</>;
}
