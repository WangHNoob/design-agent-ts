import type { DetailedLog } from '@/components/Console/DetailedLogs';
import type { TimelineEntry } from '@/components/Console/StepsTimeline';

const STORAGE_KEY = 'gdt-logs';
const MAX_ENTRIES = 500;

export interface StoredSession {
  sessionId: string;
  logs: DetailedLog[];
  timeline: TimelineEntry[];
  createdAt: string;
}

class LogStore {
  private sessions: Map<string, StoredSession> = new Map();
  private loaded = false;

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredSession[];
        for (const s of parsed) {
          this.sessions.set(s.sessionId, s);
        }
      }
    } catch {
      // ignore
    }
  }

  private persist() {
    try {
      const entries = Array.from(this.sessions.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // storage full or unavailable
    }
  }

  saveSession(sessionId: string, logs: DetailedLog[], timeline: TimelineEntry[]) {
    this.load();
    const trimmedLogs = logs.slice(-MAX_ENTRIES);
    this.sessions.set(sessionId, {
      sessionId,
      logs: trimmedLogs,
      timeline,
      createdAt: new Date().toISOString(),
    });
    this.persist();
  }

  getSession(sessionId: string): StoredSession | null {
    this.load();
    return this.sessions.get(sessionId) ?? null;
  }

  listSessions(): StoredSession[] {
    this.load();
    return Array.from(this.sessions.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  clearAll() {
    this.sessions.clear();
    localStorage.removeItem(STORAGE_KEY);
  }

  exportSession(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session) return null;
    return JSON.stringify(session, null, 2);
  }

  exportAll(): string {
    this.load();
    return JSON.stringify(Array.from(this.sessions.values()), null, 2);
  }
}

export const logStore = new LogStore();
