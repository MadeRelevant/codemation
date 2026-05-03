import { connect, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Per-route polling ceiling. 60 seconds per probe is generous on purpose: cold Turbopack
 * compiles of large App Router pages on resource-constrained machines (e.g. WSL capped at
 * 4 cpu / 8 GB) routinely take 15–30s. The previous 10s ceiling triggered a CLI exit
 * cascade on otherwise-healthy boots.
 *
 * Each probe loops `MAX_PROBE_ATTEMPTS × PROBE_DELAY_MS` and each fetch can also itself block
 * for the route's compile time, so the effective ceiling is well above 60 wall-clock seconds.
 */
const MAX_PROBE_ATTEMPTS = 1200;
const PROBE_DELAY_MS = 50;
const TCP_CONNECT_TIMEOUT_MS = 1000;

export class DevHttpProbe {
  async waitUntilUrlRespondsOk(url: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_PROBE_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, { redirect: "manual" });
        if (response.ok || response.status === 404 || this.isRedirectStatus(response.status)) {
          return;
        }
      } catch {
        // not listening yet
      }
      await delay(PROBE_DELAY_MS);
    }
    throw new Error(`Timed out waiting for HTTP response from ${url}`);
  }

  /**
   * Wait until the given TCP port accepts a connection on the loopback host. Used after spawning
   * Next dev to confirm the child process bound its port — we deliberately do NOT wait for an HTTP
   * response, because Next's first cold compile (the catch-all API route's import graph alone can
   * take 30–90s on a 4-CPU WSL box) would otherwise trip the probe ceiling and SIGTERM the dev
   * tree. Cold compile happens on the first browser request, which is the standard Next-dev UX.
   */
  async waitUntilTcpListenerReady(host: string, port: number): Promise<void> {
    for (let attempt = 0; attempt < MAX_PROBE_ATTEMPTS; attempt += 1) {
      if (await this.tryConnect(host, port)) {
        return;
      }
      await delay(PROBE_DELAY_MS);
    }
    throw new Error(`Timed out waiting for ${host}:${port} to accept a TCP connection.`);
  }

  private async tryConnect(host: string, port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let socket: Socket | null = null;
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        if (socket) {
          socket.removeAllListeners();
          socket.destroy();
        }
        resolve(ok);
      };
      try {
        socket = connect({ host, port });
        socket.setTimeout(TCP_CONNECT_TIMEOUT_MS);
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.once("timeout", () => finish(false));
      } catch {
        finish(false);
      }
    });
  }

  async waitUntilGatewayHealthy(gatewayBaseUrl: string): Promise<void> {
    const normalizedBase = gatewayBaseUrl.replace(/\/$/, "");
    for (let attempt = 0; attempt < MAX_PROBE_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`${normalizedBase}/api/dev/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // Server not listening yet.
      }
      await delay(PROBE_DELAY_MS);
    }
    throw new Error("Timed out waiting for the stable dev HTTP health check.");
  }

  /**
   * Polls until the active disposable runtime serves bootstrap summary through the stable CLI dev endpoint.
   */
  async waitUntilBootstrapSummaryReady(gatewayBaseUrl: string): Promise<void> {
    const normalizedBase = gatewayBaseUrl.replace(/\/$/, "");
    const url = `${normalizedBase}/api/dev/bootstrap-summary`;
    for (let attempt = 0; attempt < MAX_PROBE_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return;
        }
      } catch {
        // Runtime child restarting or not listening yet.
      }
      await delay(PROBE_DELAY_MS);
    }
    throw new Error("Timed out waiting for dev runtime bootstrap summary.");
  }

  private isRedirectStatus(status: number): boolean {
    return status >= 300 && status < 400;
  }
}
