import type { CollectionSchemaSyncer } from "./CollectionSchemaSyncer";
import type { CollectionSyncResult } from "./collectionSchemaTypes";

/**
 * Optional holder for CollectionSchemaSyncer.
 * Registered in the DI container always (with syncer=null when not applicable).
 * Lets FrontendRuntime / WorkerRuntime inject it without nullability issues.
 */
export class CollectionSchemaSyncerHolder {
  constructor(private readonly syncer: CollectionSchemaSyncer | null) {}

  async syncIfAvailable(opts?: { dryRun?: boolean }): Promise<CollectionSyncResult | null> {
    if (!this.syncer) {
      return null;
    }
    return this.syncer.sync(opts);
  }

  hasSync(): boolean {
    return this.syncer !== null;
  }
}
