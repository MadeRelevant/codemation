import { inject, injectable } from "@codemation/core";
import type { CredentialTypeDefinition, McpServerDeclaration } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { LoggerFactory } from "../application/logging/Logger";
import type { AppConfig } from "../presentation/config/AppConfig";
import { PairedFetch } from "../pairing/PairedFetch";
import { PairingConfigToken } from "../pairing/PairingConfigToken";
import type { PairingConfig } from "../pairing/pairing.types";

/**
 * Configuration read from env at construction time.
 *
 * - `CODEMATION_CATALOG_POLL_INTERVAL_SECONDS`: seconds between polls (default 300; 0 = startup-only).
 * - `CODEMATION_CATALOG_STALE_FAILURES`: consecutive failures before warn → error escalation (default 5).
 * - `CODEMATION_CATALOG_STALE_HOURS`: hours stale before escalating to error level (default 24).
 */
interface CatalogFetcherConfig {
  readonly pollIntervalMs: number;
  readonly staleFailuresThreshold: number;
  readonly staleHoursThreshold: number;
}

type EndpointState = {
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
};

/**
 * Polls the control-plane catalog endpoints on a configurable interval,
 * caches the last-known-good responses, and exposes the fetched data for
 * credential-type overrides and MCP server registrations.
 *
 * Endpoints (HMAC-gated via PairedFetch):
 *   GET /internal/catalog/mcp-servers
 *   GET /internal/catalog/credential-types
 *
 * Failure semantics: a failure on one endpoint does NOT prevent updating the
 * others. Each endpoint's consecutive-failure counter and staleness escalation
 * are tracked independently.
 *
 * When not paired with a control plane (PairingConfigToken is null),
 * start() returns immediately and all getters remain null.
 */
@injectable()
export class ControlPlaneCatalogFetcher {
  private readonly config: CatalogFetcherConfig;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Tracks in-flight refresh so stop() can safely await it. */
  private inFlight: Promise<void> | null = null;

  private _mcpServers: readonly McpServerDeclaration[] | null = null;
  private _credentialTypeOverrides: readonly CredentialTypeDefinition[] | null = null;

  private readonly mcpServersState: EndpointState = { consecutiveFailures: 0, lastSuccessAt: null };
  private readonly credentialTypesState: EndpointState = { consecutiveFailures: 0, lastSuccessAt: null };

  /**
   * Called after each successful full fetch, before the next poll is scheduled.
   * Set by AppContainerFactory to re-apply overrides on each refresh cycle.
   */
  onRefresh: (() => void) | null = null;

  constructor(
    @inject(PairedFetch) private readonly pairedFetch: PairedFetch,
    @inject(PairingConfigToken, { isOptional: true }) private readonly pairingConfig: PairingConfig | null,
    @inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory,
    @inject(ApplicationTokens.AppConfig) appConfig: AppConfig,
  ) {
    const env = appConfig.env;
    const pollSec = Number(env["CODEMATION_CATALOG_POLL_INTERVAL_SECONDS"] ?? 300);
    const staleFailures = Number(env["CODEMATION_CATALOG_STALE_FAILURES"] ?? 5);
    const staleHours = Number(env["CODEMATION_CATALOG_STALE_HOURS"] ?? 24);
    this.config = {
      pollIntervalMs: Number.isFinite(pollSec) ? pollSec * 1_000 : 300_000,
      staleFailuresThreshold: Number.isFinite(staleFailures) ? staleFailures : 5,
      staleHoursThreshold: Number.isFinite(staleHours) ? staleHours : 24,
    };
  }

  /** Latest fetched MCP server declarations; null until first successful fetch. */
  get mcpServers(): readonly McpServerDeclaration[] | null {
    return this._mcpServers;
  }

  /** Latest fetched credential type overrides; null until first successful fetch. */
  get credentialTypeOverrides(): readonly CredentialTypeDefinition[] | null {
    return this._credentialTypeOverrides;
  }

  /**
   * Fires the first fetch (non-blocking — failure is logged, not thrown) and
   * schedules the periodic poll if `pollIntervalMs > 0`.
   * No-ops immediately when pairing config is absent.
   */
  async start(): Promise<void> {
    if (!this.pairingConfig) {
      return;
    }
    try {
      await this.refresh();
    } catch {
      // refresh() handles its own errors; this catch is belt-and-suspenders.
    }
    this.scheduleNext();
  }

  /**
   * Cancels the poll timer. Awaits any in-flight fetch before resolving.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.inFlight) {
      await this.inFlight;
    }
  }

  /**
   * Manual one-shot fetch. Same code path as the periodic tick.
   * Errors are caught and logged internally; this method never rejects.
   */
  async refresh(): Promise<void> {
    const run = this.fetchAll();
    this.inFlight = run;
    try {
      await run;
    } finally {
      if (this.inFlight === run) {
        this.inFlight = null;
      }
    }
  }

  private scheduleNext(): void {
    if (this.stopped || this.config.pollIntervalMs <= 0) {
      return;
    }
    this.timerHandle = setTimeout(() => {
      if (this.stopped) {
        return;
      }
      void this.refresh().finally(() => this.scheduleNext());
    }, this.config.pollIntervalMs);
  }

  private async fetchAll(): Promise<void> {
    if (!this.pairingConfig) {
      return;
    }
    const logger = this.loggers.create("ControlPlaneCatalogFetcher");
    const base = this.pairingConfig.controlPlaneUrl;

    const [mcpResult, credTypesResult] = await Promise.allSettled([
      this.pairedFetch.get(`${base}/internal/catalog/mcp-servers`),
      this.pairedFetch.get(`${base}/internal/catalog/credential-types`),
    ]);

    await this.handleEndpointResult(
      mcpResult,
      this.mcpServersState,
      "mcp-servers",
      (data) => {
        this._mcpServers = data as McpServerDeclaration[];
      },
      logger,
    );

    await this.handleEndpointResult(
      credTypesResult,
      this.credentialTypesState,
      "credential-types",
      (data) => {
        this._credentialTypeOverrides = data as CredentialTypeDefinition[];
      },
      logger,
    );

    this.onRefresh?.();
  }

  private async handleEndpointResult(
    result: PromiseSettledResult<Response>,
    state: EndpointState,
    endpointName: string,
    onSuccess: (data: unknown[]) => void,
    logger: ReturnType<LoggerFactory["create"]>,
  ): Promise<void> {
    if (result.status === "fulfilled") {
      const res = result.value;
      if (res.ok) {
        try {
          const data = (await res.json()) as unknown[];
          onSuccess(data);
          state.consecutiveFailures = 0;
          state.lastSuccessAt = new Date();
          logger.info(`ControlPlaneCatalogFetcher: fetched ${endpointName} (count=${data.length})`);
          return;
        } catch (err) {
          this.logEndpointFailure(state, endpointName, err, logger);
          return;
        }
      }
      this.logEndpointFailure(state, endpointName, new Error(`HTTP ${res.status} ${res.statusText}`), logger);
    } else {
      this.logEndpointFailure(state, endpointName, result.reason, logger);
    }
  }

  private logEndpointFailure(
    state: EndpointState,
    endpointName: string,
    err: unknown,
    logger: ReturnType<LoggerFactory["create"]>,
  ): void {
    state.consecutiveFailures++;
    const staleHours = state.lastSuccessAt ? (Date.now() - state.lastSuccessAt.getTime()) / 3_600_000 : null;
    const errMsg = err instanceof Error ? err.message : String(err);

    const isStale =
      state.consecutiveFailures >= this.config.staleFailuresThreshold ||
      (staleHours !== null && staleHours >= this.config.staleHoursThreshold);

    if (isStale) {
      const staleLabel = staleHours !== null ? `${staleHours.toFixed(1)}h` : "never-succeeded";
      logger.error(
        `ControlPlaneCatalogFetcher: ${endpointName} is stale — control plane unreachable (failures=${state.consecutiveFailures}, stale=${staleLabel}): ${errMsg}`,
        err instanceof Error ? err : undefined,
      );
    } else {
      logger.warn(
        `ControlPlaneCatalogFetcher: ${endpointName} fetch failed, retaining prior cached value (failures=${state.consecutiveFailures}): ${errMsg}`,
        err instanceof Error ? err : undefined,
      );
    }
    // NOTE: cached value is intentionally preserved (last-known-good).
  }
}
