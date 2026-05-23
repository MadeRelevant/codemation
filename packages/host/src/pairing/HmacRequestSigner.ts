import { createHmac, createHash, randomBytes } from "node:crypto";
import { inject, injectable } from "@codemation/core";
import type { PairingConfig } from "./pairing.types";
import { PairingConfigToken } from "./PairingConfigToken";

export interface SignedHeaders {
  readonly Authorization: string;
}

@injectable()
export class HmacRequestSigner {
  constructor(@inject(PairingConfigToken) private readonly config: PairingConfig) {}

  sign(method: string, urlOrPath: string, body: string): SignedHeaders {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString("base64");

    const parsed = new URL(urlOrPath, "http://placeholder");
    const path = (parsed.pathname + parsed.search).toLowerCase();

    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    const baseString = [method.toUpperCase(), path, ts, nonce, bodyHash].join("\n");

    // eslint-disable-next-line codemation/no-buffer-everything -- pairing secret is 32 bytes, never large
    const secretBytes = Buffer.from(this.config.pairingSecret, "base64");
    const sig = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");

    return {
      Authorization: `Codemation-Hmac v=1,workspaceId=${this.config.workspaceId},ts=${ts},nonce=${nonce},sig=${sig}`,
    };
  }
}
