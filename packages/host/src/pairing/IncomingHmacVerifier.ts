import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { inject, injectable } from "@codemation/core";
import type { PairingConfig, PairingVerificationResult } from "./pairing.types";
import { PairingConfigToken } from "./PairingConfigToken";

/**
 * Verifies incoming HMAC-signed requests from the control plane.
 * Mirrors the control-plane HmacVerifier — both sides follow docs/pairing-protocol.md.
 */
@injectable()
export class IncomingHmacVerifier {
  private readonly usedNonces = new Map<string, number>();
  private readonly nonceTtlSeconds = 600; // 10 minutes

  constructor(@inject(PairingConfigToken) private readonly config: PairingConfig) {}

  verify(method: string, url: string, body: string, authHeader: string | null): PairingVerificationResult {
    if (!authHeader?.startsWith("Codemation-Hmac ")) {
      return { failure: "missing" };
    }

    const parts = this.parseHeader(authHeader);
    if (!parts) return { failure: "missing" };
    if (parts.v !== "1") return { failure: "version" };

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - parts.ts) > 300) return { failure: "expired" };

    if (parts.workspaceId !== this.config.workspaceId) return { failure: "workspace" };

    const parsed = new URL(url, "http://placeholder");
    const path = (parsed.pathname + parsed.search).toLowerCase();
    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    const baseString = [method.toUpperCase(), path, parts.ts, parts.nonce, bodyHash].join("\n");

    // eslint-disable-next-line codemation/no-buffer-everything -- pairing secret is 32 bytes, never large
    const secretBytes = Buffer.from(this.config.pairingSecret, "base64");
    const expected = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(parts.sig);
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return { failure: "signature" };
    }

    this.pruneExpiredNonces(nowSec);
    const nonceKey = `${parts.workspaceId}:${parts.nonce}`;
    if (this.usedNonces.has(nonceKey)) return { failure: "replay" };
    this.usedNonces.set(nonceKey, nowSec + this.nonceTtlSeconds);

    return { workspaceId: parts.workspaceId };
  }

  private parseHeader(header: string): {
    v: string;
    workspaceId: string;
    ts: number;
    nonce: string;
    sig: string;
  } | null {
    const payload = header.slice("Codemation-Hmac ".length);
    const fields: Record<string, string> = {};
    for (const part of payload.split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) return null;
      fields[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    const { v, workspaceId, ts, nonce, sig } = fields;
    if (!v || !workspaceId || !ts || !nonce || !sig) return null;
    return { v, workspaceId, ts: Number(ts), nonce, sig };
  }

  private pruneExpiredNonces(nowSec: number): void {
    for (const [key, expiry] of this.usedNonces.entries()) {
      if (expiry <= nowSec) this.usedNonces.delete(key);
    }
  }
}
