/**
 * Mutual exclusion service for schema sync.
 * Ensures only one process runs schema migration at a time.
 * Postgres: database-level advisory locks. SQLite: in-process async mutex.
 */
export interface CollectionAdvisoryLockService {
  /**
   * Acquire a lock, run fn, and release the lock.
   * The key should be stable across restarts.
   */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}
