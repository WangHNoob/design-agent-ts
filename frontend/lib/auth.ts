import { createAuthClient } from "better-auth/react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: API_BASE,
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;
