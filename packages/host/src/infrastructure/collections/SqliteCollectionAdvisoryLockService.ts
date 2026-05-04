import type { CollectionAdvisoryLockService } from "./CollectionAdvisoryLockService.types";

/**
 * In-process async mutex for SQLite (single-process model).
 * Uses a Map of chained Promises to serialize access per key.
 */
export class SqliteCollectionAdvisoryLockService implements CollectionAdvisoryLockService {
  private readonly locks = new Map<string, Promise<void>>();

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(key) ?? Promise.resolve();
    let releaseLock!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.locks.set(
      key,
      prior.then(() => next),
    );

    await prior;
    try {
      return await fn();
    } finally {
      releaseLock();
      // Clean up the entry once all waiters have resolved
      if (this.locks.get(key) === next) {
        this.locks.delete(key);
      }
    }
  }
}
