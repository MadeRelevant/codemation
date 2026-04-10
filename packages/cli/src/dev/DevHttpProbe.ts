import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export type DevNextColdPathTiming = Readonly<{
  path: string;
  durationMs: number;
}>;

export class DevHttpProbe {
  async waitUntilUrlRespondsOk(url: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(url, { redirect: "manual" });
        if (response.ok || response.status === 404 || this.isRedirectStatus(response.status)) {
          return;
        }
      } catch {
        // not listening yet
      }
      await delay(50);
    }
    throw new Error(`Timed out waiting for HTTP response from ${url}`);
  }

  async waitUntilGatewayHealthy(gatewayBaseUrl: string): Promise<void> {
    const normalizedBase = gatewayBaseUrl.replace(/\/$/, "");
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(`${normalizedBase}/api/dev/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // Server not listening yet.
      }
      await delay(50);
    }
    throw new Error("Timed out waiting for the stable dev HTTP health check.");
  }

  /**
   * After `/` responds, Turbopack may still need to compile the `/api/*` catch-all, other API paths,
   * and App Router pages. Hitting each once during CLI startup moves that cost off the first browser interaction.
   * Any HTTP status (401, 302, 200, …) means Next returned a response for that URL.
   *
   * Includes `api/auth/session` (often a multi-second first compile) and a workflow detail URL so the
   * `(shell)/workflows/[workflowId]` tree is built — list-only warms miss that (e.g. apps/test-dev’s `wf.hot-reload-probe`).
   */
  async warmNextDevColdPaths(nextOrigin: string): Promise<ReadonlyArray<DevNextColdPathTiming>> {
    const normalized = nextOrigin.replace(/\/$/, "");
    const relativePaths = [
      "/api/auth/session",
      "/api/workflows",
      "/api/users",
      "/workflows",
      "/users",
      "/login",
      "/workflows/wf.hot-reload-probe",
    ];
    const timings: DevNextColdPathTiming[] = [];
    for (const relativePath of relativePaths) {
      const url = `${normalized}${relativePath}`;
      const started = performance.now();
      await this.waitUntilUrlReturnsHttpStatus(url);
      timings.push({ path: relativePath, durationMs: Math.round(performance.now() - started) });
    }
    return timings;
  }

  private async waitUntilUrlReturnsHttpStatus(url: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(url, { redirect: "manual" });
        if (response.status > 0) {
          return;
        }
      } catch {
        // Next not accepting connections yet, or still compiling.
      }
      await delay(50);
    }
    throw new Error(`Timed out waiting for Next to respond at ${url}`);
  }

  /**
   * Polls until the active disposable runtime serves bootstrap summary through the stable CLI dev endpoint.
   */
  async waitUntilBootstrapSummaryReady(gatewayBaseUrl: string): Promise<void> {
    const normalizedBase = gatewayBaseUrl.replace(/\/$/, "");
    const url = `${normalizedBase}/api/dev/bootstrap-summary`;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return;
        }
      } catch {
        // Runtime child restarting or not listening yet.
      }
      await delay(50);
    }
    throw new Error("Timed out waiting for dev runtime bootstrap summary.");
  }

  private isRedirectStatus(status: number): boolean {
    return status >= 300 && status < 400;
  }
}
