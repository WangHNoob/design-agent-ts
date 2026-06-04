const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

export interface ExecuteRequest {
  requirement: string;
  sessionId?: string;
  mode: 'design' | 'query' | 'table';
  role?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ExecuteResponse {
  success: boolean;
  output: string | null;
  error: string | null;
  sessionId: string;
}

export interface HealthResponse {
  status: string;
}

export interface SessionMeta {
  id: string;
  requirement: string;
  mode: 'design' | 'query' | 'table';
  role: string;
  status: 'running' | 'waiting_hitl' | 'completed' | 'failed' | 'clarifying';
  createdAt: string;
  updatedAt: string;
  output?: string;
  error?: string;
  hitlCheckpointId?: string;
}

export interface HITLCheckpoint {
  id: string;
  sessionId: string;
  stage: 'plan' | 'subagent' | 'integrate';
  status: 'waiting_review' | 'approved' | 'rejected' | 'modified';
  content: string;
  contentType: 'markdown' | 'json';
  agentName?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewAction?: 'approve' | 'reject' | 'modify';
  reviewComment?: string;
  modifiedContent?: string;
}

export async function executeDesign(req: ExecuteRequest): Promise<ExecuteResponse> {
  const res = await fetch(`${API_BASE}/api/console/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function cancelExecution(sessionId: string): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/console/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    return res.json();
  } catch {
    // If the cancel request fails (e.g. server already closed the connection),
    // still return success — the fetch abort will handle the rest.
    return { success: false };
  }
}

export function executeDesignStream(
  req: ExecuteRequest,
  onEvent: (event: string, data: unknown) => void,
  onError?: (error: Error) => void
): { close: () => void } {
  const sessionId = req.sessionId ?? crypto.randomUUID();
  const body = { ...req, sessionId };

  const controller = new AbortController();

  fetch(`${API_BASE}/api/console/execute/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      onError?.(new Error(`后端错误 (${res.status}): ${text}`));
      return;
    }
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const block of lines) {
        const eventMatch = block.match(/^event: (.+)$/m);
        const dataMatch = block.match(/^data: (.+)$/m);
        if (eventMatch && dataMatch) {
          try {
            const data = JSON.parse(dataMatch[1]);
            onEvent(eventMatch[1], data);
          } catch {
            onEvent(eventMatch[1], dataMatch[1]);
          }
        }
      }
    }
  }).catch((err) => {
    onError?.(err);
  });

  return {
    close: () => controller.abort(),
  };
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
  return res.json();
}

export async function listSessions(limit = 50, offset = 0): Promise<{ sessions: SessionMeta[]; total: number }> {
  const res = await fetch(`${API_BASE}/api/sessions?limit=${limit}&offset=${offset}`);
  return res.json();
}

export async function getSession(id: string): Promise<SessionMeta> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`);
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
}

export async function listHITLCheckpoints(sessionId?: string): Promise<{ checkpoints: HITLCheckpoint[] }> {
  const url = sessionId
    ? `${API_BASE}/api/hitl/checkpoints?sessionId=${sessionId}`
    : `${API_BASE}/api/hitl/checkpoints`;
  const res = await fetch(url);
  return res.json();
}

export async function getHITLCheckpoint(id: string): Promise<HITLCheckpoint> {
  const res = await fetch(`${API_BASE}/api/hitl/checkpoints/${id}`);
  return res.json();
}

export async function reviewHITLCheckpoint(
  id: string,
  action: 'approve' | 'reject' | 'modify',
  options?: { comment?: string; modifiedContent?: string }
): Promise<HITLCheckpoint> {
  const res = await fetch(`${API_BASE}/api/hitl/checkpoints/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...options }),
  });
  return res.json();
}

// Settings API
export interface AppSettingsResponse {
  modelProvider?: string;
  modelName?: string;
  modelBaseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  hitlEnabled?: boolean;
  maxClarifyRounds?: number;
  streamingEnabled?: boolean;
  autoSaveSessions?: boolean;
  tavilyEnabled?: boolean;
  tavilyApiKeyPreview?: string;
  modelApiKeyPreview?: string;
}

export interface TavilyStatus {
  connected: boolean;
  enabled: boolean;
  apiKeySet: boolean;
  preview: string;
}

export async function getSettings(): Promise<AppSettingsResponse> {
  const res = await fetch(`${API_BASE}/api/settings`);
  return res.json();
}

export async function saveSettings(settings: Partial<AppSettingsResponse> & { tavilyApiKey?: string }): Promise<{ success: boolean; settings: AppSettingsResponse }> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getTavilyStatus(): Promise<TavilyStatus> {
  const res = await fetch(`${API_BASE}/api/settings/mcp/status`);
  return res.json();
}

export interface ConfigStatus {
  configured: boolean;
  needsApiKey: boolean;
  needsTavilyKey: boolean;
}

export async function getConfigStatus(): Promise<ConfigStatus> {
  const res = await fetch(`${API_BASE}/api/settings/status`);
  return res.json();
}

export interface SessionFileInfo {
  name: string;
  size: string;
  downloadUrl: string;
}

export interface SessionTaskFiles {
  taskId: string;
  domain: string;
  path: string;
  files: SessionFileInfo[];
}

export interface SessionFilesResponse {
  sessionId: string;
  tasks: SessionTaskFiles[];
}

export async function fetchSessionFiles(sessionId: string): Promise<SessionFilesResponse> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/files`);
  if (!res.ok) throw new Error(`Failed to fetch files: ${res.status}`);
  return res.json();
}

export function getSessionZipUrl(sessionId: string): string {
  return `${API_BASE}/api/sessions/${sessionId}/files/zip`;
}

export function downloadSessionFile(downloadUrl: string): void {
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
