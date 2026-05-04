import { createHash } from "node:crypto";
import type { CollectionAdvisoryLockService } from "./CollectionAdvisoryLockService.types";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

/**
 * PostgreSQL advisory lock service using pg_advisory_lock / pg_advisory_unlock.
 * Hashes the string key to a stable bigint via the first 8 bytes of SHA-256.
 */
export class PostgresCollectionAdvisoryLockService implements CollectionAdvisoryLockService {
  constructor(private readonly prismaClient: PrismaDatabaseClient) {}

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const lockId = this.keyToLockId(key);
    await this.prismaClient.$executeRawUnsafe(`SELECT pg_advisory_lock(${lockId})`);
    try {
      return await fn();
    } finally {
      await this.prismaClient.$executeRawUnsafe(`SELECT pg_advisory_unlock(${lockId})`);
    }
  }

  private keyToLockId(key: string): bigint {
    const hash = createHash("sha256").update(key).digest();
    // Read first 8 bytes as an unsigned 64-bit integer, then sign-extend to fit Postgres bigint
    const high = hash.readUInt32BE(0);
    const low = hash.readUInt32BE(4);
    const unsigned = BigInt(high) * BigInt(0x100000000) + BigInt(low);
    // Postgres bigint is signed 64-bit; wrap if needed
    const maxSigned = BigInt("9223372036854775807");
    if (unsigned > maxSigned) {
      return unsigned - BigInt("18446744073709551616");
    }
    return unsigned;
  }
}
