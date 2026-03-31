import { CodemationHonoApiApp, ServerLoggerFactory, logLevelPolicyFactory } from "@codemation/host/next/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

import type { DevApiRuntimeContext } from "./DevApiRuntimeTypes";
import type { DevApiRuntimeHost } from "./DevApiRuntimeHost";

type ClosableServer = Readonly<{
  close(callback?: (error?: Error) => void): unknown;
}>;

export class DevApiRuntimeServer {
  private readonly bootstrapLogger = new ServerLoggerFactory(logLevelPolicyFactory).create(
    "codemation-cli.dev-runtime",
  );
  private server: ClosableServer | null = null;

  constructor(
    private readonly httpPort: number,
    private readonly workflowWebSocketPort: number,
    private readonly host: DevApiRuntimeHost,
  ) {}

  async start(): Promise<DevApiRuntimeContext> {
    const root = new Hono();
    root.get("/health", (c) => c.json({ ok: true }));
    root.all("*", async (c) => {
      const context = await this.host.prepare();
      return context.container.resolve(CodemationHonoApiApp).fetch(c.req.raw);
    });
    await this.listen(root);
    try {
      return await this.host.prepare();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    const failures: Error[] = [];
    if (server) {
      try {
        await this.closeServer(server);
      } catch (error) {
        failures.push(this.normalizeError(error));
      }
    }
    try {
      await this.host.stop();
    } catch (error) {
      failures.push(this.normalizeError(error));
    }
    if (failures.length > 0) {
      throw failures[0];
    }
  }

  private async listen(root: Hono): Promise<void> {
    if (this.server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let resolved = false;
      const server = serve(
        {
          fetch: root.fetch,
          port: this.httpPort,
          hostname: "127.0.0.1",
        },
        () => {
          resolved = true;
          this.server = server;
          resolve();
        },
      );
      server.on("error", (error) => {
        if (resolved) {
          this.bootstrapLogger.error("runtime HTTP server error", this.normalizeError(error));
          return;
        }
        reject(error);
      });
    });
    this.bootstrapLogger.debug(
      `runtime listening httpPort=${this.httpPort} workflowWebSocketPort=${this.workflowWebSocketPort}`,
    );
  }

  private closeServer(server: ClosableServer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
