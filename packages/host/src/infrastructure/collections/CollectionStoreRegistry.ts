import type { ExecutionContext } from "@codemation/core";

/** Store for a single collection — equivalent to the value type in ExecutionContext.collections. */
type CollectionStore = NonNullable<ExecutionContext["collections"]>[string];

/**
 * Registry of runtime collection stores, keyed by collection name.
 * Built at boot after schema sync, injected into ExecutionContext.
 */
export class CollectionStoreRegistry {
  private readonly stores: Map<string, CollectionStore>;

  constructor(stores: ReadonlyMap<string, CollectionStore>) {
    this.stores = new Map(stores);
  }

  get(name: string): CollectionStore | undefined {
    return this.stores.get(name);
  }

  names(): ReadonlyArray<string> {
    return Array.from(this.stores.keys());
  }

  toRecord(): Readonly<Record<string, CollectionStore>> {
    const record: Record<string, CollectionStore> = {};
    for (const [name, store] of this.stores) {
      record[name] = store;
    }
    return record;
  }
}
