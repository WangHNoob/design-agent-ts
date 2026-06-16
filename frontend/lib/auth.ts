const API_BASE = "/api/auth";

export async function signIn(email: string, password: string) {
  const res = await fetch(`${API_BASE}/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "登录失败");
  }
  return res.json();
}

export async function signUp(email: string, password: string, name: string) {
  const res = await fetch(`${API_BASE}/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "注册失败");
  }
  return res.json();
}

export async function signOut() {
  await fetch(`${API_BASE}/sign-out`, {
    method: "POST",
    credentials: "include",
  });
}
