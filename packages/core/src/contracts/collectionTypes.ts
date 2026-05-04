/**
 * Represents a typed store for a single collection.
 * All rows include auto-managed id, created_at, and updated_at fields.
 */
export interface CollectionStore<TRow extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Insert a new row. id, created_at, and updated_at are auto-populated.
   */
  insert(row: TRow): Promise<TRow & { id: string; created_at: Date; updated_at: Date }>;

  /**
   * Get a single row by id.
   */
  get(id: string): Promise<(TRow & { id: string; created_at: Date; updated_at: Date }) | null>;

  /**
   * Find a single row matching the provided filter.
   */
  findOne(filter: Partial<TRow>): Promise<(TRow & { id: string; created_at: Date; updated_at: Date }) | null>;

  /**
   * List rows with optional pagination and filtering.
   */
  list(opts?: {
    limit?: number;
    offset?: number;
    where?: Partial<TRow>;
  }): Promise<{ rows: ReadonlyArray<TRow & { id: string; created_at: Date; updated_at: Date }>; total: number }>;

  /**
   * Update a row by id with partial data.
   */
  update(id: string, patch: Partial<TRow>): Promise<TRow & { id: string; created_at: Date; updated_at: Date }>;

  /**
   * Delete a row by id. Hard delete only (no soft delete).
   */
  delete(id: string): Promise<{ deleted: boolean }>;
}

/**
 * Runtime collections context: keyed by collection name.
 */
export type CollectionsContext = Readonly<Record<string, CollectionStore>>;
