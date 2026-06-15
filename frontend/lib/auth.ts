import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

// Use relative path so auth requests go through Next.js API proxy
// (frontend/app/api/auth/[...auth]/route.ts → backend /api/auth/*)
// This avoids cross-origin cookie issues — Better Auth uses cookie-based sessions.
export const authClient = createAuthClient({
  baseURL: "",  // Same origin — requests go to /api/auth/*
  plugins: [genericOAuthClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;
