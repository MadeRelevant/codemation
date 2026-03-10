import net from "node:net";
import process from "node:process";
import type { CodemationPlannedRuntime, CodemationResolvedPorts } from "./types";

export class CodemationPortPlanner {
  async plan(_: CodemationPlannedRuntime): Promise<CodemationResolvedPorts> {
    const preferredFrontendPort = this.parsePort(process.env.CODEMATION_FRONTEND_PORT, 3000);
    const frontendPort = await this.pickAvailablePort(preferredFrontendPort);
    const preferredWebSocketPort = this.parsePort(process.env.CODEMATION_WS_PORT, frontendPort + 1);
    const websocketPort = await this.pickAvailablePort(preferredWebSocketPort);
    return { frontendPort, websocketPort };
  }

  private parsePort(rawPort: string | undefined, fallback: number): number {
    const parsed = Number(rawPort);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
    return fallback;
  }

  private async pickAvailablePort(preferredPort: number): Promise<number> {
    const startPort = Number.isInteger(preferredPort) && preferredPort > 0 ? preferredPort : 3000;
    for (let port = startPort; port < startPort + 50; port++) {
      if (await this.isPortFree(port)) return port;
    }
    const error = Error(`No available port found in range ${startPort}-${startPort + 49}`);
    error.name = "CodemationCliError";
    throw error;
  }

  private async isPortFree(port: number): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const server = net
        .createServer()
        .once("error", () => resolve(false))
        .once("listening", () => server.close(() => resolve(true)))
        .listen({ port, host: "127.0.0.1" });
      server.unref();
    });
  }
}
