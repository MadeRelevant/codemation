import http from "node:http";
import { generateKeyPair, exportJWK, SignJWT, type CryptoKey } from "jose";

/**
 * Reusable test JWKS helper for managed-auth integration tests.
 *
 * Generates a test EdDSA keypair (never a production key), and exposes:
 * - `sign(payload)` — sign a JWT with the test private key.
 * - `publicJwks()` — export the public key set for mounting a fake JWKS server.
 *
 * Usage:
 *   const testJwks = await ManagedAuthTestJwks.generate("my-kid");
 *   const server = new ManagedAuthTestJwksServer();
 *   await server.start(testJwks.publicJwks());
 *   const token = await testJwks.sign({ iss, aud, sub, exp });
 *   // ... test requests ...
 *   await server.stop();
 */
export class ManagedAuthTestJwks {
  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly jwks: { keys: Record<string, unknown>[] },
    readonly kid: string,
  ) {}

  static async generate(kid = "test-key-1"): Promise<ManagedAuthTestJwks> {
    const { privateKey, publicKey } = await generateKeyPair("EdDSA");
    const pub = await exportJWK(publicKey);
    return new ManagedAuthTestJwks(privateKey, { keys: [{ ...pub, kid, use: "sig", alg: "EdDSA" }] }, kid);
  }

  publicJwks(): { keys: Record<string, unknown>[] } {
    return this.jwks;
  }

  async sign(payload: { sub?: string; iss: string; aud: string; exp: number; nbf?: number }): Promise<string> {
    const builder = new SignJWT({ sub: payload.sub ?? "user-test" })
      .setProtectedHeader({ alg: "EdDSA", kid: this.kid })
      .setIssuer(payload.iss)
      .setAudience(payload.aud)
      .setExpirationTime(payload.exp);
    if (payload.nbf !== undefined) {
      builder.setNotBefore(payload.nbf);
    }
    return builder.sign(this.privateKey);
  }
}

/**
 * Minimal HTTP server that serves a static JWKS document.
 * Used to simulate the control-plane JWKS endpoint in tests.
 */
export class ManagedAuthTestJwksServer {
  private server: http.Server | null = null;
  private port = 0;

  async start(jwks: { keys: unknown[] }): Promise<void> {
    const json = JSON.stringify(jwks);
    this.server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(json);
    });
    this.port = await new Promise<number>((resolve, reject) => {
      this.server!.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to get server address"));
          return;
        }
        resolve(addr.port);
      });
      this.server!.once("error", reject);
    });
  }

  jwksUrl(): string {
    return `http://127.0.0.1:${this.port}/.well-known/jwks.json`;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }
}
