import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://localhost:4527";

export async function GET(request: NextRequest) {
  return proxyAuthRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyAuthRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyAuthRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyAuthRequest(request);
}

async function proxyAuthRequest(request: NextRequest) {
  const url = new URL(request.url);

  // Map frontend /api/auth/* → backend /api/auth/* (Better Auth)
  // Map frontend /api/auth-external/* → backend /auth/* (verification code endpoints)
  let targetPath: string;
  if (url.pathname.startsWith("/api/auth-external/")) {
    targetPath = url.pathname.replace("/api/auth-external/", "/auth/");
  } else {
    targetPath = `/api/auth${url.pathname.replace("/api/auth", "")}`;
  }
  const targetUrl = `${API_BASE}${targetPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("host", new URL(API_BASE).host);

  // Forward the request body (if any)
  let body: BodyInit | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  // Build response, forwarding all Set-Cookie headers
  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    // Skip transfer-encoding since Next.js handles it
    if (key.toLowerCase() === "transfer-encoding") return;
    responseHeaders.set(key, value);
  });

  // Ensure cookies are set with correct SameSite for cross-origin scenarios
  // When proxied through Next.js, cookies are same-origin to the browser
  const setCookie = responseHeaders.get("set-cookie");
  if (setCookie) {
    // Better Auth sets cookies with SameSite=lax by default which is fine for same-origin
    responseHeaders.delete("set-cookie");
    responseHeaders.set("set-cookie", setCookie);
  }

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
