import { inject, injectable } from "@codemation/core";
import type { HmacNonceStore } from "../../pairing/HmacNonceStore";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

/**
 * Durable HMAC nonce store backed by the Prisma database (T6 security fix).
 *
 * Uses an upsert with `create`+unique constraint to achieve atomic
 * "insert if not exists": a Prisma unique-constraint violation means the nonce
 * was already present (replay). Expired nonces are pruned inline on each call —
 * acceptable for v1 given the low write rate of the pairing channel.
 */
@injectable()
export class PrismaHmacNonceStore implements HmacNonceStore {
  constructor(@inject(PrismaDatabaseClientToken) private readonly prisma: PrismaDatabaseClient) {}

  async recordIfNew(nonce: string, expiresAt: Date): Promise<boolean> {
    // Prune expired nonces inline (v1 housekeeping; low write rate on this table)
    await this.prisma.hmacNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    try {
      await this.prisma.hmacNonce.create({ data: { nonce, expiresAt } });
      return true;
    } catch {
      // Unique constraint violation → nonce already present → replay
      return false;
    }
  }
}
