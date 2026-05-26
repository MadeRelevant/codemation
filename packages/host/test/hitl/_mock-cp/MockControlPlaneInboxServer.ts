import http from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HTTP server that stands in for the control plane during integration tests.
 *
 * Verifies HMAC-signed requests on POST /internal/hitl/tasks and records
 * received deliveries. Returns a deterministic `inboxItemId` for each task.
 *
 * Reused across story 07 integration tests — ~50 LOC.
 */
export class MockControlPlaneInboxServer {
  private server: http.Server | null = null;
  private port = 0;

  readonly receivedDeliveries: Array<{ path: string; body: unknown }> = [];
  private responseStatusOverride: number | null = null;

  constructor(
    private readonly workspaceId: string,
    private readonly pairingSecret: string,
  ) {}

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      let rawBody = "";
      req.on("data", (chunk: Buffer) => {
        rawBody += chunk.toString();
      });
      req.on("end", () => {
        const authorized = this.verifyHmac(req, rawBody);
        if (!authorized) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const body = rawBody ? (JSON.parse(rawBody) as unknown) : null;
        this.receivedDeliveries.push({ path: url.pathname, body });

        const overrideStatus = this.responseStatusOverride;
        if (overrideStatus !== null && overrideStatus >= 500) {
          res.writeHead(overrideStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Simulated server error" }));
          return;
        }

        const parsedBody = body as { taskId?: string } | null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ inboxItemId: `inbox-${parsedBody?.taskId ?? "unknown"}` }));
      });
    });

    this.port = await new Promise<number>((resolve, reject) => {
      this.server!.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to get mock CP server address"));
          return;
        }
        resolve(addr.port);
      });
      this.server!.once("error", reject);
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Set a non-200 response for the next N requests (use to simulate CP errors). */
  setResponseStatus(status: number): void {
    this.responseStatusOverride = status;
  }

  clearResponseStatus(): void {
    this.responseStatusOverride = null;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  private verifyHmac(req: http.IncomingMessage, body: string): boolean {
    const authHeader = (req.headers["authorization"] ?? "") as string;
    if (!authHeader.startsWith("Codemation-Hmac ")) return false;

    const payload = authHeader.slice("Codemation-Hmac ".length);
    const fields: Record<string, string> = {};
    for (const part of payload.split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) return false;
      fields[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }

    const { v, workspaceId: claimedWs, ts, nonce, sig } = fields;
    if (!v || !claimedWs || !ts || !nonce || !sig) return false;
    if (v !== "1") return false;
    if (claimedWs !== this.workspaceId) return false;

    // eslint-disable-next-line no-restricted-properties -- integration test: HMAC replay-window requires real wall-clock time
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - Number(ts)) > 300) return false;

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = (url.pathname + url.search).toLowerCase();
    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    const baseString = [req.method?.toUpperCase() ?? "POST", path, ts, nonce, bodyHash].join("\n");

    // eslint-disable-next-line codemation/no-buffer-everything -- integration test: bounded pairing secret
    const secretBytes = Buffer.from(this.pairingSecret, "base64");
    const expected = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(sig);
    return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  }
}
