import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";
import type { DatabasePort } from "../../port/infra/DatabasePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type {
  ForgetMemoryParams,
  ForgetResult,
  LongTermMemoryPort,
  MemoryEntry,
  MemorySearchResult,
  MemorySemanticType,
  RetrieveMemoryParams,
  StoreMemoryParams,
} from "../../port/memory/LongTermMemoryPort.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import { PostgresLongTermMemoryAdapter } from "./PostgresLongTermMemoryAdapter.js";

/**
 * Resolves the current tenant for every operation and delegates to the
 * tenant-bound PostgreSQL adapter. Calls outside a request context fail closed.
 */
export class ContextualPostgresLongTermMemoryAdapter implements LongTermMemoryPort {
  constructor(
    private readonly db: DatabasePort,
    private readonly idGenerator: IdGeneratorPort,
    private readonly contextStorage: ContextStoragePort<TenantContext>,
  ) {}

  store(params: StoreMemoryParams): Promise<MemoryEntry> {
    return this.delegate().store(params);
  }

  get(namespace: string, key: string): Promise<MemoryEntry | null> {
    return this.delegate().get(namespace, key);
  }

  getById(id: string): Promise<MemoryEntry | null> {
    return this.delegate().getById(id);
  }

  search(params: RetrieveMemoryParams): Promise<MemorySearchResult[]> {
    return this.delegate().search(params);
  }

  list(namespace: string, semanticType?: MemorySemanticType): Promise<MemoryEntry[]> {
    return this.delegate().list(namespace, semanticType);
  }

  update(
    id: string,
    patch: Partial<Pick<MemoryEntry, "content" | "importance" | "tags" | "embedding">>,
  ): Promise<MemoryEntry | null> {
    return this.delegate().update(id, patch);
  }

  forget(params: ForgetMemoryParams): Promise<ForgetResult> {
    return this.delegate().forget(params);
  }

  healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  private delegate(): PostgresLongTermMemoryAdapter {
    const userId = this.contextStorage.getStore()?.userId;
    if (!userId) {
      throw new Error("Tenant context is required for long-term memory access");
    }
    return new PostgresLongTermMemoryAdapter(this.db, this.idGenerator, userId);
  }
}
