import type { CollectionStore } from "@codemation/core";

type CollectionRow = Record<string, unknown> & { id: string; created_at: Date; updated_at: Date };

/**
 * Simple in-memory CollectionStore implementation for tests.
 * Not a mock — real implementation with real state.
 */
export class InMemoryCollectionStore implements CollectionStore<Record<string, unknown>> {
  private readonly rows: Map<string, CollectionRow> = new Map();
  private counter = 0;

  async insert(row: Record<string, unknown>): Promise<CollectionRow> {
    const id = `row_${++this.counter}`;
    const now = new Date();
    const stored: CollectionRow = { ...row, id, created_at: now, updated_at: now };
    this.rows.set(id, stored);
    return stored;
  }

  async get(id: string): Promise<CollectionRow | null> {
    return this.rows.get(id) ?? null;
  }

  async findOne(filter: Partial<Record<string, unknown>>): Promise<CollectionRow | null> {
    for (const row of this.rows.values()) {
      if (this.matches(row, filter)) {
        return row;
      }
    }
    return null;
  }

  async list(opts?: {
    limit?: number;
    offset?: number;
    where?: Partial<Record<string, unknown>>;
  }): Promise<{ rows: ReadonlyArray<CollectionRow>; total: number }> {
    let all = Array.from(this.rows.values());
    if (opts?.where) {
      all = all.filter((row) => this.matches(row, opts.where!));
    }
    const total = all.length;
    const offset = opts?.offset ?? 0;
    const sliced = opts?.limit !== undefined ? all.slice(offset, offset + opts.limit) : all.slice(offset);
    return { rows: sliced, total };
  }

  async update(id: string, patch: Partial<Record<string, unknown>>): Promise<CollectionRow> {
    const existing = this.rows.get(id);
    if (!existing) {
      throw new Error(`Row "${id}" not found`);
    }
    const updated: CollectionRow = {
      ...existing,
      ...patch,
      id,
      created_at: existing.created_at,
      updated_at: new Date(),
    };
    this.rows.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const existed = this.rows.has(id);
    this.rows.delete(id);
    return { deleted: existed };
  }

  private matches(row: CollectionRow, filter: Partial<Record<string, unknown>>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (row[key] !== value) {
        return false;
      }
    }
    return true;
  }
}

export class InMemoryCollectionStoreFixtureFactory {
  static create(): InMemoryCollectionStore {
    return new InMemoryCollectionStore();
  }

  static asRegistry(
    stores: Readonly<Record<string, InMemoryCollectionStore>>,
  ): Readonly<Record<string, InMemoryCollectionStore>> {
    return stores;
  }
}
