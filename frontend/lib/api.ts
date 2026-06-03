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

// ── O11y Observability API ─────────────────────────────────────────

const O11Y_BASE = process.env.NEXT_PUBLIC_O11Y_BASE || 'http://localhost:3003';

export interface O11ySession {
  id: string;
  name?: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  traces: O11yTrace[];
}

export interface O11yTrace {
  id: string;
  session_id: string;
  name?: string;
  status: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  spans: O11ySpan[];
  stats?: {
    span_count: number;
    error_count: number;
    llm_call_count: number;
    tool_call_count: number;
  };
}

export interface O11ySpan {
  id: string;
  trace_id: string;
  session_id: string;
  parent_span_id?: string;
  name: string;
  span_type: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  input_data?: Record<string, unknown> | null;
  output_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  status: string;
  error_message?: string | null;
}

export interface O11ySessionMetrics {
  session_id: string;
  trace_count: number;
  total_spans: number;
  total_llm_calls: number;
  total_tool_calls: number;
  total_errors: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  avg_trace_duration_ms: number;
  p95_trace_duration_ms: number;
  agent_breakdown: Array<{
    agent_id: string;
    llm_calls: number;
    tool_calls: number;
    tokens: number;
    duration_ms: number;
  }>;
  timeline: Record<string, unknown>[];
}

export async function listO11ySessions(skip = 0, limit = 50): Promise<O11ySession[]> {
  const res = await fetch(`${O11Y_BASE}/api/v1/sessions?skip=${skip}&limit=${limit}`);
  if (!res.ok) throw new Error(`listO11ySessions failed: ${res.status}`);
  return res.json();
}

export async function getO11ySession(sessionId: string): Promise<O11ySession | null> {
  const res = await fetch(`${O11Y_BASE}/api/v1/sessions/${sessionId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getO11ySession failed: ${res.status}`);
  return res.json();
}

export async function getO11ySessionMetrics(sessionId: string): Promise<O11ySessionMetrics | null> {
  const res = await fetch(`${O11Y_BASE}/api/v1/sessions/${sessionId}/metrics`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getO11ySessionMetrics failed: ${res.status}`);
  return res.json();
}

export interface O11yEvent {
  type: string;
  session_id?: string;
  trace_id?: string;
  current_phase?: string;
  progress_pct?: number;
  step_description?: string;
  agent_name?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export function subscribeO11yEvents(
  onEvent: (event: O11yEvent) => void,
  onError?: (error: Error) => void
): { close: () => void } {
  const controller = new AbortController();

  fetch(`${O11Y_BASE}/api/v1/events`, {
    signal: controller.signal,
    headers: { Accept: 'text/event-stream' },
  }).then(async (res) => {
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
        if (!block.trim() || block.startsWith(':')) continue;
        const eventMatch = block.match(/^event: (.+)$/m);
        const dataMatch = block.match(/^data: (.+)$/m);
        if (dataMatch) {
          try {
            const data = JSON.parse(dataMatch[1]) as O11yEvent;
            onEvent(data);
          } catch {
            // ignore parse error
          }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError?.(err);
    }
  });

  return {
    close: () => controller.abort(),
  };
}
