import { inject, injectable } from "@codemation/core";
import type { McpServerDeclaration } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { LoggerFactory } from "../application/logging/Logger";
import type { AppConfig } from "../presentation/config/AppConfig";
import { McpServerCatalog } from "./McpServerCatalog";
import { PairedFetch } from "../pairing/PairedFetch";
import { PairingConfigToken } from "../pairing/PairingConfigToken";
import type { PairingConfig } from "../pairing/pairing.types";

/**
 * Configuration for McpRegistryFetcher. Read from env at construction time.
 *
 * - `CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS`: seconds between polls (default 300; 0 = startup-only).
 * - `CODEMATION_REGISTRY_STALE_FAILURES`: consecutive failures before logging a staleness warning (default 5).
 * - `CODEMATION_REGISTRY_STALE_HOURS`: hours stale before escalating to error level (default 24).
 */
interface RegistryFetcherConfig {
  readonly pollIntervalMs: number;
  readonly staleFailuresThreshold: number;
  readonly staleHoursThreshold: number;
}

/**
 * Polls the control-plane registry for MCP server declarations and merges them
 * into `McpServerCatalog` as source `"controlPlane"` (highest-priority source, D6 in mcp-design.md).
 *
 * Endpoint: GET /internal/registry/mcp-servers (HMAC-gated via PairedFetch).
 *
 * Cache note: the endpoint does not yet support `?since=` filtering (Story 12 open question),
 * so we re-fetch the full active list each tick and re-merge. The catalog merge is idempotent,
 * so this is safe; it is slightly wasteful at scale. Revisit when Story 12 ships server-side
 * `since` support.
 *
 * Offline fallback: on fetch failure, the catalog's controlPlane source is NOT cleared — the
 * last-known-good list is preserved. After `staleFailuresThreshold` consecutive failures a warn
 * is logged; after `staleHoursThreshold` hours of accumulated staleness the level escalates to error.
 *
 * When the installation is not paired with a control plane (PairingConfigToken is null),
 * the fetcher no-ops entirely.
 */
@injectable()
export class McpRegistryFetcher {
  private readonly config: RegistryFetcherConfig;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private consecutiveFailures = 0;
  private lastSuccessAt: Date | null = null;
  /** Tracks in-flight refresh so stop() can safely await it. */
  private inFlight: Promise<void> | null = null;

  constructor(
    @inject(McpServerCatalog) private readonly catalog: McpServerCatalog,
    @inject(PairedFetch) private readonly pairedFetch: PairedFetch,
    @inject(PairingConfigToken) private readonly pairingConfig: PairingConfig,
    @inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory,
    @inject(ApplicationTokens.AppConfig) appConfig: AppConfig,
  ) {
    const env = appConfig.env;
    const pollSec = Number(env["CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS"] ?? 300);
    const staleFailures = Number(env["CODEMATION_REGISTRY_STALE_FAILURES"] ?? 5);
    const staleHours = Number(env["CODEMATION_REGISTRY_STALE_HOURS"] ?? 24);
    this.config = {
      pollIntervalMs: pollSec * 1_000,
      staleFailuresThreshold: Number.isFinite(staleFailures) ? staleFailures : 5,
      staleHoursThreshold: Number.isFinite(staleHours) ? staleHours : 24,
    };
  }

  /**
   * Fires the first fetch (non-blocking — failure is logged, not thrown) and
   * schedules the periodic poll if `pollIntervalMs > 0`.
   */
  async start(): Promise<void> {
    // First fetch: await it but don't let failure propagate to the caller.
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
    const run = this.fetchAndMerge();
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

  private async fetchAndMerge(): Promise<void> {
    const logger = this.loggers.create("McpRegistryFetcher");
    try {
      const url = `${this.pairingConfig.controlPlaneUrl}/internal/registry/mcp-servers`;
      const res = await this.pairedFetch.get(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const declarations = (await res.json()) as McpServerDeclaration[];
      this.catalog.merge("controlPlane", declarations);
      this.consecutiveFailures = 0;
      this.lastSuccessAt = new Date();
      logger.info(`McpRegistryFetcher: merged control-plane declarations (count=${declarations.length})`);
    } catch (err) {
      this.consecutiveFailures++;
      const staleHours = this.lastSuccessAt ? (Date.now() - this.lastSuccessAt.getTime()) / 3_600_000 : null;
      const errMsg = err instanceof Error ? err.message : String(err);

      // Escalate to error after N consecutive failures, OR after we've been stale for N hours
      // following a previously-successful fetch. First-time failures (never succeeded) use warn.
      const isStale =
        this.consecutiveFailures >= this.config.staleFailuresThreshold ||
        (staleHours !== null && staleHours >= this.config.staleHoursThreshold);

      if (isStale) {
        const staleLabel = staleHours !== null ? `${staleHours.toFixed(1)}h` : "never-succeeded";
        logger.error(
          `McpRegistryFetcher: registry is stale — control plane unreachable (failures=${this.consecutiveFailures}, stale=${staleLabel}): ${errMsg}`,
          err instanceof Error ? err : undefined,
        );
      } else {
        logger.warn(
          `McpRegistryFetcher: fetch failed, retaining prior catalog state (failures=${this.consecutiveFailures}): ${errMsg}`,
          err instanceof Error ? err : undefined,
        );
      }
      // NOTE: we intentionally do NOT call catalog.clear("controlPlane") — last-known-good
      // state is preserved until a successful fetch replaces it.
    }
  }
}
