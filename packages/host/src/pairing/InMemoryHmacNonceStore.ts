import { injectable } from "@codemation/core";
import type { HmacNonceStore } from "./HmacNonceStore";

/**
 * In-memory HMAC nonce store for unit tests and non-managed mode.
 *
 * NOTE: Nonces are lost on process restart; this is intentional for non-managed
 * mode where replay risk is low. Use PrismaHmacNonceStore in managed mode.
 */
@injectable()
export class InMemoryHmacNonceStore implements HmacNonceStore {
  private readonly store = new Map<string, number>();

  async recordIfNew(nonce: string, expiresAt: Date): Promise<boolean> {
    const nowSec = Math.floor(Date.now() / 1000);
    // Prune expired entries on each call (mirrors original in-process behaviour)
    for (const [key, expirySec] of this.store.entries()) {
      if (expirySec <= nowSec) this.store.delete(key);
    }
    if (this.store.has(nonce)) return false;
    this.store.set(nonce, Math.floor(expiresAt.getTime() / 1000));
    return true;
  }
}
