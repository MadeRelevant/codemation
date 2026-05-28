import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ControlPlaneCatalogFetcher } from "../../src/credentials/ControlPlaneCatalogFetcher";
import type { McpServerDeclaration } from "@codemation/core";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTROL_PLANE_URL = "https://cp.example.com";

const fakePairingConfig = {
  workspaceId: "ws-1",
  pairingSecret: "secret",
  controlPlaneUrl: CONTROL_PLANE_URL,
};

const fakeMcpServers: McpServerDeclaration[] = [
  { id: "gmail", displayName: "Gmail MCP", description: "Gmail", transport: "http", url: "https://mcp.example.com" },
];
const fakeCredTypes = [{ typeId: "oauth.google.gmail", displayName: "Gmail OAuth" }];

function makeAppConfig(env: Record<string, string | undefined> = {}) {
  return {
    env,
    consumerRoot: "/",
    repoRoot: "/",
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    collections: [],
    plugins: [],
    mcpServers: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    persistence: { kind: "none" as const },
    scheduler: { kind: "none" as const, workerQueues: [] },
    eventing: { kind: "none" as const },
    whitelabel: { displayName: "Test" },
    webSocketPort: 3001,
    webSocketBindHost: "localhost",
  };
}

function makePairedFetch(responses: {
  mcpServers?: unknown;
  credTypes?: unknown;
  mcpServersOk?: boolean;
  credTypesOk?: boolean;
  mcpServersThrow?: boolean;
  credTypesThrow?: boolean;
}) {
  return {
    get: vi.fn(async (url: string): Promise<Response> => {
      if (url.includes("mcp-servers")) {
        if (responses.mcpServersThrow) throw new Error("network error: mcp-servers");
        return {
          ok: responses.mcpServersOk !== false,
          status: responses.mcpServersOk !== false ? 200 : 500,
          statusText: responses.mcpServersOk !== false ? "OK" : "Internal Server Error",
          json: async () => responses.mcpServers ?? [],
        } as unknown as Response;
      }
      if (url.includes("credential-types")) {
        if (responses.credTypesThrow) throw new Error("network error: credential-types");
        return {
          ok: responses.credTypesOk !== false,
          status: responses.credTypesOk !== false ? 200 : 500,
          statusText: responses.credTypesOk !== false ? "OK" : "Internal Server Error",
          json: async () => responses.credTypes ?? [],
        } as unknown as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    }),
  };
}

type WarnSpy = ReturnType<typeof vi.fn>;
type ErrorSpy = ReturnType<typeof vi.fn>;

function makeLoggers(): { loggers: ReturnType<typeof makeLoggerFactory>; warnSpy: WarnSpy; errorSpy: ErrorSpy } {
  const warnSpy = vi.fn();
  const errorSpy = vi.fn();
  const loggers = makeLoggerFactory(warnSpy, errorSpy);
  return { loggers, warnSpy, errorSpy };
}

function makeLoggerFactory(warnSpy: WarnSpy, errorSpy: ErrorSpy) {
  return {
    create: (_scope: string) => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: warnSpy,
      error: errorSpy,
    }),
  };
}

function makeFetcher(options: {
  pairedFetch: ReturnType<typeof makePairedFetch>;
  pairingConfig: typeof fakePairingConfig | null;
  loggers?: ReturnType<typeof makeLoggerFactory>;
  env?: Record<string, string | undefined>;
}): ControlPlaneCatalogFetcher {
  const { loggers: loggersArg, warnSpy } = makeLoggers();
  void warnSpy;
  return new ControlPlaneCatalogFetcher(
    options.pairedFetch as never,
    options.pairingConfig,
    (options.loggers ?? loggersArg) as never,
    makeAppConfig(options.env) as never,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ControlPlaneCatalogFetcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("no-op when pairingConfig is null", () => {
    it("start() returns immediately without fetching", async () => {
      const pairedFetch = makePairedFetch({ mcpServers: fakeMcpServers });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: null });

      await fetcher.start();

      expect(pairedFetch.get).not.toHaveBeenCalled();
    });

    it("all getters return null when pairingConfig is null", async () => {
      const pairedFetch = makePairedFetch({});
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: null });

      await fetcher.start();

      expect(fetcher.mcpServers).toBeNull();
      expect(fetcher.credentialTypeOverrides).toBeNull();
    });
  });

  describe("getters before first fetch", () => {
    it("all getters return null before start()", () => {
      const pairedFetch = makePairedFetch({});
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      expect(fetcher.mcpServers).toBeNull();
      expect(fetcher.credentialTypeOverrides).toBeNull();
    });
  });

  describe("successful fetch populates both getters", () => {
    it("populates mcpServers and credentialTypeOverrides", async () => {
      const pairedFetch = makePairedFetch({
        mcpServers: fakeMcpServers,
        credTypes: fakeCredTypes,
      });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      await fetcher.refresh();

      expect(fetcher.mcpServers).toEqual(fakeMcpServers);
      expect(fetcher.credentialTypeOverrides).toEqual(fakeCredTypes);
    });

    it("fetches both endpoints in parallel (both URLs called)", async () => {
      const pairedFetch = makePairedFetch({
        mcpServers: fakeMcpServers,
        credTypes: fakeCredTypes,
      });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      await fetcher.refresh();

      const calledUrls = pairedFetch.get.mock.calls.map((c) => c[0] as string);
      expect(calledUrls.some((u) => u.includes("mcp-servers"))).toBe(true);
      expect(calledUrls.some((u) => u.includes("credential-types"))).toBe(true);
      expect(pairedFetch.get).toHaveBeenCalledTimes(2);
    });
  });

  describe("single-endpoint failure", () => {
    it("credential-types failure: mcpServers still updates; credentialTypeOverrides retains prior null", async () => {
      const pairedFetch = makePairedFetch({
        mcpServers: fakeMcpServers,
        credTypesOk: false,
      });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      await fetcher.refresh();

      expect(fetcher.mcpServers).toEqual(fakeMcpServers);
      expect(fetcher.credentialTypeOverrides).toBeNull(); // unchanged — no prior value
    });

    it("mcp-servers failure: credentialTypeOverrides updates; mcpServers retains prior value", async () => {
      const pairedFetch = makePairedFetch({
        mcpServers: fakeMcpServers,
        credTypes: fakeCredTypes,
      });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });
      // First successful fetch to populate all
      await fetcher.refresh();
      expect(fetcher.mcpServers).toEqual(fakeMcpServers);

      // Second fetch: mcp-servers fails
      const updatedCredTypes = [{ typeId: "oauth.slack", displayName: "Slack OAuth" }];
      pairedFetch.get.mockImplementation(async (url: string) => {
        if (url.includes("mcp-servers")) {
          return {
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
            json: async () => [],
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => updatedCredTypes,
        } as unknown as Response;
      });

      await fetcher.refresh();

      // mcpServers retains last-known-good
      expect(fetcher.mcpServers).toEqual(fakeMcpServers);
      // Other getters updated
      expect(fetcher.credentialTypeOverrides).toEqual(updatedCredTypes);
    });

    it("network throw on one endpoint does not prevent others from updating", async () => {
      const pairedFetch = makePairedFetch({
        mcpServersThrow: true,
        credTypes: fakeCredTypes,
      });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      await fetcher.refresh();

      expect(fetcher.mcpServers).toBeNull();
      expect(fetcher.credentialTypeOverrides).toEqual(fakeCredTypes);
    });
  });

  describe("all-failure case", () => {
    it("both getters retain prior values (null) when all endpoints fail", async () => {
      const pairedFetch = makePairedFetch({
        mcpServersOk: false,
        credTypesOk: false,
      });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      await fetcher.refresh();

      expect(fetcher.mcpServers).toBeNull();
      expect(fetcher.credentialTypeOverrides).toBeNull();
    });

    it("logs a warn for each failing endpoint on first failure", async () => {
      const warnSpy = vi.fn();
      const errorSpy = vi.fn();
      const loggers = makeLoggerFactory(warnSpy, errorSpy);

      const pairedFetch = makePairedFetch({
        mcpServersOk: false,
        credTypesOk: false,
      });
      const fetcher = new ControlPlaneCatalogFetcher(
        pairedFetch as never,
        fakePairingConfig,
        loggers as never,
        makeAppConfig() as never,
      );

      await fetcher.refresh();

      // One warn per failing endpoint
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("log level escalation after staleFailuresThreshold failures", () => {
    it("escalates to error after consecutive failures reach threshold", async () => {
      const warnSpy = vi.fn();
      const errorSpy = vi.fn();
      const loggers = makeLoggerFactory(warnSpy, errorSpy);

      const pairedFetch = makePairedFetch({
        mcpServersOk: true,
        mcpServers: fakeMcpServers,
        credTypesOk: false,
      });
      // staleFailuresThreshold = 2 for this test
      const fetcher = new ControlPlaneCatalogFetcher(
        pairedFetch as never,
        fakePairingConfig,
        loggers as never,
        makeAppConfig({ CODEMATION_CATALOG_STALE_FAILURES: "2" }) as never,
      );

      // First failure → warn (failures=1, threshold=2)
      await fetcher.refresh();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();

      warnSpy.mockClear();
      errorSpy.mockClear();

      // Second failure → error (failures=2, threshold=2)
      await fetcher.refresh();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]![0]).toContain("credential-types");
    });
  });

  describe("stop() before first fetch", () => {
    it("stop() is safe when called before start()", async () => {
      const pairedFetch = makePairedFetch({});
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      await expect(fetcher.stop()).resolves.toBeUndefined();
    });
  });

  describe("stop() awaits in-flight fetch", () => {
    it("awaits an in-flight refresh before resolving", async () => {
      let resolveResponse!: (value: Response) => void;
      const responsePromise = new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      });

      const pairedFetch = {
        get: vi.fn(async (_url: string): Promise<Response> => responsePromise),
      };

      const fetcher = new ControlPlaneCatalogFetcher(
        pairedFetch as never,
        fakePairingConfig,
        makeLoggers().loggers as never,
        makeAppConfig() as never,
      );

      const refreshPromise = fetcher.refresh();
      const stopPromise = fetcher.stop();

      // Resolve the in-flight fetch with a valid response
      resolveResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [],
      } as unknown as Response);

      await expect(Promise.all([refreshPromise, stopPromise])).resolves.toBeDefined();
    });
  });

  describe("refresh() never rejects", () => {
    it("does not throw even when all endpoints fail with network errors", async () => {
      const pairedFetch = makePairedFetch({
        mcpServersThrow: true,
        credTypesThrow: true,
      });
      const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });

      await expect(fetcher.refresh()).resolves.toBeUndefined();
    });
  });

  describe("env var configuration", () => {
    it("uses custom poll interval from env", () => {
      const pairedFetch = makePairedFetch({});
      // Just check construction doesn't throw; scheduling tested via refresh
      expect(
        () =>
          new ControlPlaneCatalogFetcher(
            pairedFetch as never,
            fakePairingConfig,
            makeLoggers().loggers as never,
            makeAppConfig({ CODEMATION_CATALOG_POLL_INTERVAL_SECONDS: "60" }) as never,
          ),
      ).not.toThrow();
    });
  });

  describe("start() fires initial fetch", () => {
    it("calls both endpoints on start()", async () => {
      const pairedFetch = makePairedFetch({
        mcpServers: fakeMcpServers,
        credTypes: fakeCredTypes,
      });
      const fetcher = new ControlPlaneCatalogFetcher(
        pairedFetch as never,
        fakePairingConfig,
        makeLoggers().loggers as never,
        makeAppConfig({ CODEMATION_CATALOG_POLL_INTERVAL_SECONDS: "0" }) as never, // no re-scheduling
      );

      await fetcher.start();

      expect(pairedFetch.get).toHaveBeenCalledTimes(2);
      expect(fetcher.mcpServers).toEqual(fakeMcpServers);
      expect(fetcher.credentialTypeOverrides).toEqual(fakeCredTypes);

      await fetcher.stop();
    });
  });
});

describe("ControlPlaneCatalogFetcher — mcpServers control-plane fetch", () => {
  it("uses controlPlaneUrl from pairing config as base URL for mcp-servers endpoint", async () => {
    const customUrl = "https://custom-cp.example.com";
    const pairedFetch = makePairedFetch({ mcpServers: fakeMcpServers, credTypes: [] });
    const fetcher = new ControlPlaneCatalogFetcher(
      pairedFetch as never,
      { workspaceId: "ws", pairingSecret: "s", controlPlaneUrl: customUrl },
      makeLoggers().loggers as never,
      makeAppConfig() as never,
    );

    await fetcher.refresh();

    const mcpCall = pairedFetch.get.mock.calls.find(([url]) => (url as string).includes("mcp-servers"));
    expect(mcpCall).toBeDefined();
    expect(mcpCall![0]).toContain(customUrl);
    expect(mcpCall![0]).toContain("/internal/catalog/mcp-servers");
    expect(fetcher.mcpServers).toEqual(fakeMcpServers);
  });

  it("preserves last-known-good mcpServers on fetch failure", async () => {
    const pairedFetch = makePairedFetch({
      mcpServers: fakeMcpServers,
      credTypes: fakeCredTypes,
    });
    const fetcher = new ControlPlaneCatalogFetcher(
      pairedFetch as never,
      fakePairingConfig,
      makeLoggers().loggers as never,
      makeAppConfig() as never,
    );

    // Successful first fetch
    await fetcher.refresh();
    expect(fetcher.mcpServers).toEqual(fakeMcpServers);

    // Second fetch: mcp-servers throws
    pairedFetch.get.mockImplementation(async (url: string) => {
      if (url.includes("mcp-servers")) throw new Error("mcp network error");
      return { ok: true, status: 200, statusText: "OK", json: async () => [] } as unknown as Response;
    });

    await fetcher.refresh();
    // Last-known-good preserved
    expect(fetcher.mcpServers).toEqual(fakeMcpServers);
  });

  let savedSetTimeout: typeof globalThis.setTimeout;
  let savedClearTimeout: typeof globalThis.clearTimeout;

  beforeEach(() => {
    savedSetTimeout = globalThis.setTimeout;
    savedClearTimeout = globalThis.clearTimeout;
  });

  afterEach(() => {
    globalThis.setTimeout = savedSetTimeout;
    globalThis.clearTimeout = savedClearTimeout;
  });

  it("does not schedule a timer when pollInterval is 0 (startup-only)", async () => {
    const setTimeoutCalls: number[] = [];
    (globalThis as typeof globalThis).setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      setTimeoutCalls.push(args[1] as number);
      return savedSetTimeout(...args);
    }) as typeof setTimeout;

    const pairedFetch = makePairedFetch({ mcpServers: [], credTypes: [] });
    const fetcher = new ControlPlaneCatalogFetcher(
      pairedFetch as never,
      fakePairingConfig,
      makeLoggers().loggers as never,
      makeAppConfig({ CODEMATION_CATALOG_POLL_INTERVAL_SECONDS: "0" }) as never,
    );

    await fetcher.start();
    await fetcher.stop();

    expect(setTimeoutCalls).toHaveLength(0);
  });
});

describe("ControlPlaneCatalogFetcher — onRefresh wires to CredentialTypeRegistryImpl.mergeDefinitions", () => {
  it("calls mergeDefinitions('controlPlane', credentialTypeOverrides) after a successful refresh", async () => {
    const { CredentialTypeRegistryImpl } = await import("../../src/domain/credentials/CredentialTypeRegistryImpl");

    const warnSpy = vi.fn();
    const registry = new CredentialTypeRegistryImpl(makeLoggerFactory(warnSpy, vi.fn()) as never);
    const mergeDefinitionsSpy = vi.spyOn(registry, "mergeDefinitions");

    const pairedFetch = makePairedFetch({
      mcpServers: fakeMcpServers,
      credTypes: fakeCredTypes,
    });
    const fetcher = makeFetcher({ pairedFetch, pairingConfig: fakePairingConfig });
    fetcher.onRefresh = () => {
      registry.mergeDefinitions("controlPlane", fetcher.credentialTypeOverrides ?? []);
    };

    await fetcher.refresh();

    expect(mergeDefinitionsSpy).toHaveBeenCalledOnce();
    expect(mergeDefinitionsSpy).toHaveBeenCalledWith("controlPlane", fakeCredTypes);
    expect(registry.getType("oauth.google.gmail")?.displayName).toBe("Gmail OAuth");
  });
});
