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
    const message =
      data.message ||
      data.error ||
      (res.status === 401
        ? "邮箱或密码错误。若尚未注册，请先切换到注册。"
        : "登录失败");
    throw new Error(message);
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
    const message =
      data.message ||
      data.error ||
      (res.status === 422
        ? "该邮箱可能已注册，请直接登录或更换邮箱。"
        : "注册失败");
    throw new Error(message);
  }
  return res.json();
}

export async function signOut() {
  await fetch(`${API_BASE}/sign-out`, {
    method: "POST",
    credentials: "include",
  });
}
