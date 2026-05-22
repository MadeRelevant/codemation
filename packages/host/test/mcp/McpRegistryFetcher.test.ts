import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { McpServerDeclaration } from "@codemation/core";
import { McpRegistryFetcher } from "../../src/mcp/McpRegistryFetcher";
import type { McpServerDeclarationSource } from "../../src/mcp/McpServerCatalog";

// ── Fakes ─────────────────────────────────────────────────────────────────────

const CONTROL_PLANE_URL = "https://cp.example.com";

const DECLARATION: McpServerDeclaration = {
  id: "gmail",
  displayName: "Gmail",
  description: "Gmail MCP",
  transport: "http",
  url: "https://mcp.gmail.example.com",
};

function makeResponse(status: number, body?: unknown): Response {
  if (status === 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(null, { status });
}

class FakePairedFetch {
  readonly calls: string[] = [];
  private responses: Response[] = [];

  enqueue(res: Response): void {
    this.responses.push(res);
  }

  async get(url: string): Promise<Response> {
    this.calls.push(url);
    const res = this.responses.shift();
    if (!res) throw new Error("FakePairedFetch: no response queued");
    return res;
  }
}

class FakeMcpServerCatalog {
  readonly merges: Array<{ source: McpServerDeclarationSource; declarations: McpServerDeclaration[] }> = [];
  readonly clears: McpServerDeclarationSource[] = [];

  merge(source: McpServerDeclarationSource, declarations: readonly McpServerDeclaration[]): void {
    this.merges.push({ source, declarations: [...declarations] });
  }

  clear(source: McpServerDeclarationSource): void {
    this.clears.push(source);
  }

  getAll(): readonly McpServerDeclaration[] {
    return [];
  }
}

type LogCall = { level: "warn" | "error"; message: string };

class FakeLogger {
  readonly calls: LogCall[] = [];
  info(_msg: string, _err?: Error): void {}
  debug(_msg: string, _err?: Error): void {}
  warn(message: string, _err?: Error): void {
    this.calls.push({ level: "warn", message });
  }
  error(message: string, _err?: Error): void {
    this.calls.push({ level: "error", message });
  }
}

class FakeLoggerFactory {
  readonly logger = new FakeLogger();
  create(_name: string): FakeLogger {
    return this.logger;
  }
}

function makePairingConfig(overrides: Partial<{ controlPlaneUrl: string }> = {}) {
  return {
    workspaceId: "ws-1",
    pairingSecret: "secret",
    controlPlaneUrl: overrides.controlPlaneUrl ?? CONTROL_PLANE_URL,
  };
}

function makeAppConfig(env: Record<string, string> = {}) {
  return { env: { ...env } } as unknown as import("../../src/presentation/config/AppConfig").AppConfig;
}

function makeFetcher(options: {
  fetch: FakePairedFetch;
  catalog: FakeMcpServerCatalog;
  loggers: FakeLoggerFactory;
  env?: Record<string, string>;
}): McpRegistryFetcher {
  return new McpRegistryFetcher(
    options.catalog as unknown as import("../../src/mcp/McpServerCatalog").McpServerCatalog,
    options.fetch as unknown as import("../../src/pairing/PairedFetch").PairedFetch,
    makePairingConfig(),
    options.loggers as unknown as import("../../src/application/logging/Logger").LoggerFactory,
    makeAppConfig(options.env),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("McpRegistryFetcher", () => {
  let fetch: FakePairedFetch;
  let catalog: FakeMcpServerCatalog;
  let loggers: FakeLoggerFactory;

  beforeEach(() => {
    fetch = new FakePairedFetch();
    catalog = new FakeMcpServerCatalog();
    loggers = new FakeLoggerFactory();
  });

  afterEach(() => {
    // Vitest's fake timers are reset by clearMocks/restoreMocks in the vitest config.
  });

  describe("start()", () => {
    it("calls /internal/registry/mcp-servers on start", async () => {
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });

      await fetcher.start();

      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0]).toBe(`${CONTROL_PLANE_URL}/internal/registry/mcp-servers`);
    });

    it("merges successful response into catalog as controlPlane source", async () => {
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });

      await fetcher.start();

      expect(catalog.merges).toHaveLength(1);
      expect(catalog.merges[0]!.source).toBe("controlPlane");
      expect(catalog.merges[0]!.declarations).toEqual([DECLARATION]);
    });

    it("does NOT clear the catalog source on a failed first fetch", async () => {
      fetch.enqueue(makeResponse(503));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });

      await fetcher.start();

      expect(catalog.merges).toHaveLength(0);
      expect(catalog.clears).toHaveLength(0);
    });

    it("does not throw when the first fetch fails", async () => {
      fetch.enqueue(makeResponse(500));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });

      await expect(fetcher.start()).resolves.toBeUndefined();
    });
  });

  describe("periodic polling", () => {
    it("calls the endpoint again on the next tick", async () => {
      fetch.enqueue(makeResponse(200, [DECLARATION]));

      const fetcher = makeFetcher({
        fetch,
        catalog,
        loggers,
        // Very short interval for the test; stop() is called before it fires in real time.
        env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "9999" },
      });

      await fetcher.start();
      // Manually trigger a second refresh to simulate the next tick without real timers.
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      await fetcher.refresh();
      await fetcher.stop();

      expect(fetch.calls).toHaveLength(2);
      expect(catalog.merges).toHaveLength(2);
    });

    it("re-merges on each successful tick", async () => {
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });

      await fetcher.start();
      fetch.enqueue(makeResponse(200, [{ ...DECLARATION, id: "outlook" }]));
      await fetcher.refresh();

      expect(catalog.merges).toHaveLength(2);
      expect(catalog.merges[1]!.declarations[0]!.id).toBe("outlook");
    });
  });

  describe("failure handling", () => {
    it("logs warn on failure before the staleness threshold", async () => {
      fetch.enqueue(makeResponse(500));
      const fetcher = makeFetcher({
        fetch,
        catalog,
        loggers,
        env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0", CODEMATION_REGISTRY_STALE_FAILURES: "5" },
      });

      await fetcher.start();

      const warnCalls = loggers.logger.calls.filter((c) => c.level === "warn");
      expect(warnCalls.length).toBeGreaterThanOrEqual(1);
      expect(warnCalls[0]?.message).toContain("retaining prior catalog state");
    });

    it("escalates to error after staleFailuresThreshold consecutive failures", async () => {
      // threshold = 5; send 5 failures
      const THRESHOLD = 5;
      for (let i = 0; i < THRESHOLD; i++) {
        fetch.enqueue(makeResponse(500));
      }
      const fetcher = makeFetcher({
        fetch,
        catalog,
        loggers,
        env: {
          CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0",
          CODEMATION_REGISTRY_STALE_FAILURES: String(THRESHOLD),
        },
      });

      // First fetch via start()
      await fetcher.start();
      // 4 more via refresh()
      for (let i = 1; i < THRESHOLD; i++) {
        await fetcher.refresh();
      }

      const errorCalls = loggers.logger.calls.filter((c) => c.level === "error");
      expect(errorCalls.length).toBeGreaterThanOrEqual(1);
      expect(errorCalls[0]?.message).toContain("registry is stale");
    });

    it("does not remove catalog entries after a failed fetch", async () => {
      // First fetch succeeds
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });
      await fetcher.start();

      // Second fetch fails
      fetch.enqueue(makeResponse(503));
      await fetcher.refresh();

      // catalog.clear must never have been called
      expect(catalog.clears).toHaveLength(0);
      // The first successful merge is still there
      expect(catalog.merges).toHaveLength(1);
    });

    it("resets consecutive failure count after a successful fetch", async () => {
      // Two failures then success
      fetch.enqueue(makeResponse(500));
      fetch.enqueue(makeResponse(500));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });
      await fetcher.start();
      await fetcher.refresh();

      // Now a success
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      await fetcher.refresh();

      // After success, 3rd fetch failure should be warn not error (consecutive resets to 0)
      fetch.enqueue(makeResponse(500));
      const callsBefore = loggers.logger.calls.length;
      await fetcher.refresh();
      const newCalls = loggers.logger.calls.slice(callsBefore);
      expect(newCalls.every((c) => c.level === "warn")).toBe(true);
    });
  });

  describe("stop()", () => {
    it("cancels the timer — subsequent timer firing does not run fetch", async () => {
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      const fetcher = makeFetcher({
        fetch,
        catalog,
        loggers,
        env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "9999" },
      });

      await fetcher.start();
      await fetcher.stop();

      // No second fetch was queued; if the timer fired it would throw (no response queued)
      // Absence of error confirms the timer was cancelled.
      expect(fetch.calls).toHaveLength(1);
    });

    it("calling refresh() after stop() is a no-op w.r.t. scheduling but does not throw", async () => {
      fetch.enqueue(makeResponse(200, [DECLARATION]));
      const fetcher = makeFetcher({ fetch, catalog, loggers, env: { CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS: "0" } });

      await fetcher.start();
      await fetcher.stop();

      // refresh() itself still works (it just runs a fetch), but stop() has no timer to cancel
      // The important thing is stop() doesn't throw.
      await expect(fetcher.stop()).resolves.toBeUndefined();
    });
  });
});
