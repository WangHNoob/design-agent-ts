export interface LogCreate {
  id?: string;
  session_id: string;
  trace_id?: string | null;
  span_id?: string | null;
  timestamp?: Date;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  logger: string;
  message: string;
  thread?: string | null;
  exception?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BatchLogIn {
  logs: LogCreate[];
}

export interface LogOut {
  id: string;
  session_id: string;
  trace_id?: string | null;
  span_id?: string | null;
  timestamp: Date;
  level: string;
  logger: string;
  message: string;
  thread?: string | null;
  exception?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface LogReporter {
  batchCreateLogs(batch: BatchLogIn): Promise<{ status: string; count: number }>;
  getLogsBySession(sessionId: string, options?: { level?: string; limit?: number; offset?: number }): Promise<LogOut[]>;
}
