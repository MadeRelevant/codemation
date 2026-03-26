import { setTimeout as delay } from "node:timers/promises";

export class DevHttpProbe {
  async waitUntilUrlRespondsOk(url: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok || response.status === 404) {
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
    throw new Error("Timed out waiting for dev gateway HTTP health check.");
  }

  /**
   * Polls until the runtime child serves bootstrap summary (after gateway is up, the disposable runtime may still be wiring).
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
}
