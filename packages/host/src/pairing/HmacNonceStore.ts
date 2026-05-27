/**
 * Seam for durable HMAC replay-protection nonce storage (T6 security fix).
 *
 * The default in-process store (InMemoryHmacNonceStore) clears on restart, allowing
 * replay within the timestamp window. PrismaHmacNonceStore provides durability.
 */
export interface HmacNonceStore {
  /**
   * Atomically record a nonce if it has not been seen before.
   * Returns `true` if the nonce was new (request should proceed),
   * `false` if the nonce was already present (replay — reject).
   */
  recordIfNew(nonce: string, expiresAt: Date): Promise<boolean>;
}
