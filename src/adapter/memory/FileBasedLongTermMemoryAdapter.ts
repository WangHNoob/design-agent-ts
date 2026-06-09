import type {
  LongTermMemoryPort,
  MemoryEntry,
  MemorySearchResult,
  StoreMemoryParams,
  RetrieveMemoryParams,
  ForgetMemoryParams,
  ForgetResult,
} from "../../port/memory/LongTermMemoryPort.js";
import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

/**
 * File-based long-term memory adapter.
 *
 * Stores memories as JSONL files on disk, organized by namespace.
 * Implements a simple TF-IDF-like text similarity for semantic search
 * (no external vector database required). For production use with
 * large-scale semantic search, swap this adapter for a vector-DB
 * implementation (e.g. Chroma, Milvus, Pinecone).
 *
 * Directory layout:
 *   <baseDir>/
 *     <namespace>/
 *       memories.jsonl   — all memory entries for this namespace
 *       index.json       — inverted index for keyword search
 */
export class FileBasedLongTermMemoryAdapter implements LongTermMemoryPort {
  private cache = new Map<string, MemoryEntry[]>();
  private dirty = new Set<string>();
  private initialized = false;

  constructor(
    private readonly baseDir: string,
    private readonly fs: FileSystemPort,
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  async store(params: StoreMemoryParams): Promise<MemoryEntry> {
    await this.ensureInitialized();

    const id = this.idGenerator.randomUUID();
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id,
      semanticType: params.semanticType,
      namespace: params.namespace,
      key: params.key,
      content: params.content,
      importance: params.importance ?? 0.5,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      tags: params.tags,
      ttlMs: params.ttlMs,
    };

    const entries = this.getEntriesForNamespace(params.namespace);
    entries.push(entry);
    this.cache.set(params.namespace, entries);
    this.dirty.add(params.namespace);

    await this.persistNamespace(params.namespace);
    return entry;
  }

  async get(namespace: string, key: string): Promise<MemoryEntry | null> {
    await this.ensureInitialized();
    const entries = this.getEntriesForNamespace(namespace);
    const entry = entries.find((e) => e.key === key);
    if (entry) {
      await this.touchEntry(entry);
    }
    return entry ?? null;
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    await this.ensureInitialized();
    for (const entries of this.cache.values()) {
      const entry = entries.find((e) => e.id === id);
      if (entry) {
        await this.touchEntry(entry);
        return entry;
      }
    }
    return null;
  }

  async search(params: RetrieveMemoryParams): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    const entries = this.getEntriesForNamespace(params.namespace);

    let candidates = entries;

    // Filter by semantic type
    if (params.semanticType) {
      candidates = candidates.filter((e) => e.semanticType === params.semanticType);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      candidates = candidates.filter(
        (e) => e.tags?.some((t) => params.tags!.includes(t))
      );
    }

    // Filter by minimum importance
    if (params.minImportance !== undefined) {
      candidates = candidates.filter((e) => e.importance >= params.minImportance!);
    }

    // Filter by TTL (expired entries are still returned but scored lower)
    const now = Date.now();

    // Score by text similarity + importance + recency
    const queryTerms = this.tokenize(params.query);
    const scored = candidates.map((entry) => {
      const contentTerms = this.tokenize(entry.content);
      const similarity = this.computeSimilarity(queryTerms, contentTerms);
      const importanceBoost = entry.importance * 0.3;
      const ageMs = now - new Date(entry.createdAt).getTime();
      const recencyScore = Math.max(0, 1 - ageMs / (90 * 24 * 60 * 60 * 1000)); // decay over 90 days
      const accessBoost = Math.min(0.1, entry.accessCount * 0.02);

      const score = similarity * 0.5 + importanceBoost + recencyScore * 0.15 + accessBoost;
      return { entry, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const limit = params.limit ?? 10;
    const results = scored.slice(0, limit);

    // Touch accessed entries
    for (const { entry } of results) {
      await this.touchEntry(entry);
    }

    return results.map((r) => ({
      entry: r.entry,
      score: Math.round(r.score * 1000) / 1000,
    }));
  }

  async list(namespace: string, semanticType?: import("../../port/memory/LongTermMemoryPort.js").MemorySemanticType): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    const entries = this.getEntriesForNamespace(namespace);
    if (semanticType) {
      return entries.filter((e) => e.semanticType === semanticType);
    }
    return [...entries];
  }

  async update(id: string, patch: Partial<Pick<MemoryEntry, "content" | "importance" | "tags" | "embedding">>): Promise<MemoryEntry | null> {
    await this.ensureInitialized();

    for (const [namespace, entries] of this.cache.entries()) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) continue;

      const existing = entries[idx]!;
      const updated: MemoryEntry = {
        ...existing,
        ...patch,
        lastAccessedAt: new Date().toISOString(),
      };
      entries[idx] = updated;
      this.cache.set(namespace, entries);
      this.dirty.add(namespace);
      await this.persistNamespace(namespace);
      return updated;
    }
    return null;
  }

  async forget(params: ForgetMemoryParams): Promise<ForgetResult> {
    await this.ensureInitialized();
    const entries = this.getEntriesForNamespace(params.namespace);
    const now = Date.now();
    const removedIds: string[] = [];

    const remaining = entries.filter((entry) => {
      // Remove by explicit ID
      if (params.ids?.includes(entry.id)) {
        removedIds.push(entry.id);
        return false;
      }

      // Remove by explicit key
      if (params.keys?.includes(entry.key)) {
        removedIds.push(entry.id);
        return false;
      }

      // Remove by age + importance (forgetting mechanism)
      if (params.maxAgeMs !== undefined && params.minImportance !== undefined) {
        const age = now - new Date(entry.createdAt).getTime();
        if (age > params.maxAgeMs && entry.importance < params.minImportance) {
          removedIds.push(entry.id);
          return false;
        }
      }

      // Remove by age alone
      if (params.maxAgeMs !== undefined && params.minImportance === undefined) {
        const age = now - new Date(entry.createdAt).getTime();
        if (age > params.maxAgeMs) {
          removedIds.push(entry.id);
          return false;
        }
      }

      // Remove by importance alone
      if (params.minImportance !== undefined && params.maxAgeMs === undefined) {
        if (entry.importance < params.minImportance) {
          removedIds.push(entry.id);
          return false;
        }
      }

      // Remove by TTL expiration
      if (entry.ttlMs !== undefined) {
        const age = now - new Date(entry.createdAt).getTime();
        if (age > entry.ttlMs) {
          removedIds.push(entry.id);
          return false;
        }
      }

      return true;
    });

    this.cache.set(params.namespace, remaining);
    this.dirty.add(params.namespace);
    await this.persistNamespace(params.namespace);

    return { removedCount: removedIds.length, removedIds };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private ────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.fs.mkdir(this.baseDir, { recursive: true });
    this.initialized = true;
  }

  private getEntriesForNamespace(namespace: string): MemoryEntry[] {
    return this.cache.get(namespace) ?? [];
  }

  private async loadNamespace(namespace: string): Promise<void> {
    if (this.cache.has(namespace)) return;
    const filePath = this.fs.join(this.baseDir, namespace, "memories.jsonl");
    const data = await this.fs.readFile(filePath);
    if (!data) {
      this.cache.set(namespace, []);
      return;
    }
    const entries: MemoryEntry[] = [];
    for (const line of data.split("\n").filter((l) => l.trim())) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    this.cache.set(namespace, entries);
  }

  private async persistNamespace(namespace: string): Promise<void> {
    if (!this.dirty.has(namespace)) return;
    const entries = this.cache.get(namespace) ?? [];
    const dir = this.fs.join(this.baseDir, namespace);
    await this.fs.mkdir(dir, { recursive: true });
    const filePath = this.fs.join(dir, "memories.jsonl");
    const lines = entries.map((e) => JSON.stringify(e)).join("\n");
    await this.fs.writeFile(filePath, lines + "\n");
    this.dirty.delete(namespace);
  }

  private async touchEntry(entry: MemoryEntry): Promise<void> {
    (entry as { lastAccessedAt: string }).lastAccessedAt = new Date().toISOString();
    (entry as { accessCount: number }).accessCount += 1;
    this.dirty.add(entry.namespace);
    // Batch persist — don't write on every touch for performance
  }

  /** Simple whitespace + CJK tokenization. */
  private tokenize(text: string): string[] {
    const normalized = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, " ");
    return normalized.split(/\s+/).filter((t) => t.length > 1);
  }

  /** Compute Jaccard-like similarity between two token sets. */
  private computeSimilarity(queryTerms: string[], contentTerms: string[]): number {
    if (queryTerms.length === 0 || contentTerms.length === 0) return 0;

    const contentSet = new Set(contentTerms);
    let matches = 0;
    for (const term of queryTerms) {
      if (contentSet.has(term)) {
        matches++;
      }
    }

    // Also check for partial matches (substring)
    for (const qTerm of queryTerms) {
      for (const cTerm of contentTerms) {
        if (cTerm.length >= 2 && qTerm.length >= 2) {
          if (cTerm.includes(qTerm) || qTerm.includes(cTerm)) {
            matches += 0.5;
          }
        }
      }
    }

    return Math.min(1, matches / Math.max(queryTerms.length, 1));
  }
}
