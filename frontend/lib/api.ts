const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
  });
}

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
  const res = await apiFetch(`${API_BASE}/api/console/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function cancelExecution(sessionId: string): Promise<{ success: boolean }> {
  try {
    const res = await apiFetch(`${API_BASE}/api/console/cancel`, {
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

  apiFetch(`${API_BASE}/api/console/execute/stream`, {
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
  const res = await apiFetch(`${API_BASE}/health`, { cache: 'no-store' });
  return res.json();
}

export async function listSessions(limit = 50, offset = 0): Promise<{ sessions: SessionMeta[]; total: number }> {
  const res = await apiFetch(`${API_BASE}/api/sessions?limit=${limit}&offset=${offset}`);
  return res.json();
}

export async function getSession(id: string): Promise<SessionMeta> {
  const res = await apiFetch(`${API_BASE}/api/sessions/${id}`);
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
}

export async function listHITLCheckpoints(sessionId?: string): Promise<{ checkpoints: HITLCheckpoint[] }> {
  const url = sessionId
    ? `${API_BASE}/api/hitl/checkpoints?sessionId=${sessionId}`
    : `${API_BASE}/api/hitl/checkpoints`;
  const res = await apiFetch(url);
  return res.json();
}

export async function getHITLCheckpoint(id: string): Promise<HITLCheckpoint> {
  const res = await apiFetch(`${API_BASE}/api/hitl/checkpoints/${id}`);
  return res.json();
}

export async function reviewHITLCheckpoint(
  id: string,
  action: 'approve' | 'reject' | 'modify',
  options?: { comment?: string; modifiedContent?: string }
): Promise<HITLCheckpoint> {
  const res = await apiFetch(`${API_BASE}/api/hitl/checkpoints/${id}/review`, {
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
  const res = await apiFetch(`${API_BASE}/api/settings`);
  return res.json();
}

export async function saveSettings(settings: Partial<AppSettingsResponse> & { tavilyApiKey?: string }): Promise<{ success: boolean; settings: AppSettingsResponse }> {
  const res = await apiFetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export interface MCPToolInfo {
  name: string;
  description: string;
  serverName: string;
  parameters: Record<string, unknown>;
}

export interface MCPServer {
  name: string;
  transport: string;
  enabled: boolean;
}

export interface MCPStatus {
  enabled: boolean;
  servers: MCPServer[];
  toolNames: string[];
  toolCount: number;
  tools: MCPToolInfo[];
}

export async function getMCPStatus(): Promise<MCPStatus> {
  const res = await apiFetch(`${API_BASE}/api/settings/mcp/status`);
  return res.json();
}

export async function getTavilyStatus(): Promise<TavilyStatus> {
  const res = await apiFetch(`${API_BASE}/api/settings/tavily/status`);
  return res.json();
}

export interface ConfigStatus {
  configured: boolean;
  needsApiKey: boolean;
  needsTavilyKey: boolean;
}

export async function getConfigStatus(): Promise<ConfigStatus> {
  const res = await apiFetch(`${API_BASE}/api/settings/status`);
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
  const res = await apiFetch(`${API_BASE}/api/sessions/${sessionId}/files`);
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

// ── Prompts API ──────────────────────────────────────────────

export interface PromptInfo {
  name: string;
  preview: string;
  size: number;
  isBuiltin: boolean;
}

export interface PromptDetail {
  name: string;
  content: string;
  isBuiltin: boolean;
}

export async function listPrompts(): Promise<{ prompts: PromptInfo[] }> {
  const res = await apiFetch(`${API_BASE}/api/prompts`);
  return res.json();
}

export async function getPrompt(name: string): Promise<PromptDetail> {
  const res = await apiFetch(`${API_BASE}/api/prompts/${name}`);
  if (!res.ok) throw new Error(`Prompt '${name}' not found`);
  return res.json();
}

export async function savePrompt(name: string, content: string): Promise<{ success: boolean; isNew: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/prompts/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function deletePrompt(name: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/prompts/${name}`, { method: 'DELETE' });
  return res.json();
}

// ── Skills API ───────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  description: string;
  size: number;
}

export interface SkillDetail {
  name: string;
  description: string;
  content: string;
}

export async function listSkills(): Promise<{ skills: SkillInfo[] }> {
  const res = await apiFetch(`${API_BASE}/api/skills`);
  return res.json();
}

export async function getSkill(name: string): Promise<SkillDetail> {
  const res = await apiFetch(`${API_BASE}/api/skills/${name}`);
  if (!res.ok) throw new Error(`Skill '${name}' not found`);
  return res.json();
}

export async function saveSkill(name: string, content: string): Promise<{ success: boolean; isNew: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/skills/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function deleteSkill(name: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/skills/${name}`, { method: 'DELETE' });
  return res.json();
}

// ── Workflows API ────────────────────────────────────────────

export interface WorkflowTaskDef {
  taskId: string;
  domain: string;
  requirement: string;
  dependencies: string[];
  outputType: string;
  outputTemplate: string;
}

export interface WorkflowInfo {
  name: string;
  description: string;
  keywords: string[];
  taskCount: number;
}

export interface WorkflowDetail {
  name: string;
  description: string;
  keywords: string[];
  tasks: WorkflowTaskDef[];
  content: string;
}

export async function listWorkflows(): Promise<{ workflows: WorkflowInfo[]; validDomains: string[]; validOutputTypes: string[] }> {
  const res = await apiFetch(`${API_BASE}/api/workflows`);
  return res.json();
}

export async function getWorkflow(name: string): Promise<WorkflowDetail> {
  const res = await apiFetch(`${API_BASE}/api/workflows/${name}`);
  if (!res.ok) throw new Error(`Workflow '${name}' not found`);
  return res.json();
}

export async function saveWorkflow(name: string, def: {
  name: string;
  description: string;
  keywords: string[];
  tasks: WorkflowTaskDef[];
  body?: string;
}): Promise<{ success: boolean; isNew: boolean; taskCount: number; errors?: string[] }> {
  const res = await apiFetch(`${API_BASE}/api/workflows/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(def),
  });
  return res.json();
}

export async function deleteWorkflow(name: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/workflows/${name}`, { method: 'DELETE' });
  return res.json();
}

export async function validateWorkflow(content: string): Promise<{ valid: boolean; errors?: string[]; taskCount?: number }> {
  const res = await apiFetch(`${API_BASE}/api/workflows/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function llmGenerateWorkflowContent(prompt: string, context?: string): Promise<{ success: boolean; data: unknown; raw: string }> {
  const res = await apiFetch(`${API_BASE}/api/workflows/llm-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context }),
  });
  return res.json();
}
