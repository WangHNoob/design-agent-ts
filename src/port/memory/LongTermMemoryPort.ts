/**
 * Long-term memory port — persistent, cross-session memory for agents.
 *
 * Inspired by cognitive science's three-layer memory model:
 * - Semantic: factual knowledge (e.g. "this project uses React")
 * - Episodic: past experiences (e.g. "last session we decided on X")
 * - Procedural: operational skills (e.g. "the deployment flow is: build → test → push")
 *
 * Adapter implementations may use vector databases, key-value stores,
 * file systems, or any combination. The port is intentionally storage-agnostic.
 */

/** The semantic category of a memory entry. */
export type MemorySemanticType = "semantic" | "episodic" | "procedural" | "profile";

/** A single memory entry stored in long-term memory. */
export interface MemoryEntry {
  /** Unique identifier for this memory. */
  readonly id: string;
  /** The semantic category. */
  readonly semanticType: MemorySemanticType;
  /** The namespace / tenant for isolation (e.g. userId, projectId). */
  readonly namespace: string;
  /** The key for structured lookup (e.g. "preferred_language", "design_decision_2024_03"). */
  readonly key: string;
  /** The textual content of the memory. */
  readonly content: string;
  /** Optional embedding vector for semantic similarity search. */
  readonly embedding?: number[];
  /** Importance score (0-1). Higher = more important, less likely to be forgotten. */
  readonly importance: number;
  /** ISO timestamp when this memory was created. */
  readonly createdAt: string;
  /** ISO timestamp when this memory was last accessed. */
  readonly lastAccessedAt: string;
  /** Number of times this memory has been retrieved. */
  readonly accessCount: number;
  /** Optional tags for categorical filtering. */
  readonly tags?: string[];
  /** Optional time-to-live in milliseconds. After this duration the memory may be pruned. */
  readonly ttlMs?: number;
}

/** Parameters for storing a new memory entry. */
export interface StoreMemoryParams {
  readonly semanticType: MemorySemanticType;
  readonly namespace: string;
  readonly key: string;
  readonly content: string;
  readonly importance?: number;
  readonly tags?: string[];
  readonly ttlMs?: number;
}

/** Parameters for searching / retrieving memories. */
export interface RetrieveMemoryParams {
  readonly namespace: string;
  /** Semantic query text. Adapters that support embeddings will vectorize this. */
  readonly query: string;
  /** Maximum number of results to return. */
  readonly limit?: number;
  /** Filter by semantic type. */
  readonly semanticType?: MemorySemanticType;
  /** Filter by tags (OR semantics). */
  readonly tags?: string[];
  /** Minimum importance threshold (0-1). Only return entries with importance >= this value. */
  readonly minImportance?: number;
}

/** A scored search result from long-term memory. */
export interface MemorySearchResult {
  readonly entry: MemoryEntry;
  /** Similarity / relevance score (0-1). Higher = more relevant. */
  readonly score: number;
}

/** Parameters for the forgetting / pruning operation. */
export interface ForgetMemoryParams {
  readonly namespace: string;
  /** Maximum age in milliseconds. Memories older than this are candidates for pruning. */
  readonly maxAgeMs?: number;
  /** Minimum importance threshold. Memories below this are candidates for pruning. */
  readonly minImportance?: number;
  /** Specific memory IDs to delete. */
  readonly ids?: string[];
  /** Specific keys to delete. */
  readonly keys?: string[];
}

/** Result of a forget / prune operation. */
export interface ForgetResult {
  /** Number of memories removed. */
  readonly removedCount: number;
  /** IDs of removed memories. */
  readonly removedIds: string[];
}

/**
 * Port interface for long-term memory operations.
 *
 * Implementations must be thread-safe and handle persistence transparently.
 * All methods are async to accommodate remote storage backends.
 */
export interface LongTermMemoryPort {
  /** Store a new memory entry. Returns the created entry with generated id and timestamps. */
  store(params: StoreMemoryParams): Promise<MemoryEntry>;

  /** Retrieve a specific memory by namespace + key. */
  get(namespace: string, key: string): Promise<MemoryEntry | null>;

  /** Retrieve a specific memory by id. */
  getById(id: string): Promise<MemoryEntry | null>;

  /** Search memories by semantic similarity and/or filters. */
  search(params: RetrieveMemoryParams): Promise<MemorySearchResult[]>;

  /** List all memories in a namespace, optionally filtered by type. */
  list(namespace: string, semanticType?: MemorySemanticType): Promise<MemoryEntry[]>;

  /** Update an existing memory entry (e.g. after access to bump accessCount). */
  update(id: string, patch: Partial<Pick<MemoryEntry, "content" | "importance" | "tags" | "embedding">>): Promise<MemoryEntry | null>;

  /** Forget / prune memories based on criteria. Implements the forgetting mechanism. */
  forget(params: ForgetMemoryParams): Promise<ForgetResult>;

  /** Check if the backend is healthy and available. */
  healthCheck(): Promise<boolean>;
}
