import { setTimeout as delay } from "node:timers/promises";

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
