import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { AppConfig } from "../presentation/config/AppConfig";

/**
 * Signs and verifies single-use HITL resume tokens.
 *
 * Token format: `<taskId>.<expiresAtUnix>.<schemaHash8>.<sigBase64Url>`
 * Signature: HMAC-SHA256(AUTH_SECRET, `${taskId}.${expiresAtUnix}.${schemaHash8}`)
 *
 * Tokens are single-use (the HumanTask status transition from pending → decided/timed_out
 * is the consumption mechanism — reuse returns 409).
 */
@injectable()
export class HitlResumeTokenSigner {
  // Cached secret bytes if AUTH_SECRET is present. Null otherwise — call sites that
  // actually need to sign/verify will throw via requireSecret(). Deferring the throw
  // to method invocation (instead of constructor) keeps test setups and bootstrap
  // graphs that resolve the wider engine chain from failing when AUTH_SECRET is not
  // set; production code paths that exercise HITL still fail loudly at use time.
  private readonly secret: Buffer | null;

  constructor(@inject(ApplicationTokens.AppConfig) appConfig: AppConfig) {
    const raw = appConfig.env.AUTH_SECRET?.trim();
    this.secret = raw ? Buffer.from(raw, "utf8") : null;
  }

  private requireSecret(): Buffer {
    if (!this.secret) {
      throw new Error("HitlResumeTokenSigner: AUTH_SECRET is required.");
    }
    return this.secret;
  }

  sign(args: { taskId: string; expiresAt: Date; schemaHash: string }): string {
    const expiresAtUnix = String(Math.floor(args.expiresAt.getTime() / 1000));
    const schemaHash8 = args.schemaHash.slice(0, 8);
    const payload = `${args.taskId}.${expiresAtUnix}.${schemaHash8}`;
    const sig = createHmac("sha256", this.requireSecret()).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }

  verify(
    token: string,
  ):
    | { ok: true; taskId: string; schemaHash: string; expiresAt: Date }
    | { ok: false; reason: "malformed" | "bad_sig" | "expired" } {
    const parts = token.split(".");
    if (parts.length !== 4) {
      return { ok: false, reason: "malformed" };
    }
    const [taskId, expiresAtUnixStr, schemaHash8, receivedSig] = parts as [string, string, string, string];

    const expiresAtUnix = Number(expiresAtUnixStr);
    if (!Number.isFinite(expiresAtUnix)) {
      return { ok: false, reason: "malformed" };
    }

    const payload = `${taskId}.${expiresAtUnixStr}.${schemaHash8}`;
    const expectedSig = createHmac("sha256", this.requireSecret()).update(payload).digest("base64url");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    const receivedBuf = Buffer.from(receivedSig, "utf8");
    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      return { ok: false, reason: "bad_sig" };
    }

    const expiresAt = new Date(expiresAtUnix * 1000);
    if (expiresAt <= new Date()) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, taskId, schemaHash: schemaHash8, expiresAt };
  }

  /** SHA-256 hash of the full token string (used for revocation lookup). */
  hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}
