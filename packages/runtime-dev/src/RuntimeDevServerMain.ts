import { DevelopmentRuntimeRouteGuard } from "@codemation/host/dev-server-sidecar";
import { CodemationConsumerConfigLoader, CodemationPluginDiscovery } from "@codemation/host/server";
import { CodemationHonoApiApp, logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { RuntimeDevHost } from "./RuntimeDevHost";
import { RuntimeDevMetrics } from "./RuntimeDevMetrics";
import { RuntimeDevShutdownController } from "./RuntimeDevShutdownController";

export class RuntimeDevServerMain {
  async run(): Promise<void> {
    const metrics = new RuntimeDevMetrics();
    const host = new RuntimeDevHost(new CodemationConsumerConfigLoader(), new CodemationPluginDiscovery(), metrics);
    const loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);
    const bootstrapLogger = loggerFactory.create("codemation-runtime-dev.bootstrap");
    const httpPort = this.resolveHttpPort();

    const root = new Hono();
    root.get("/health", (c) => c.json({ ok: true }));
    root.get("/metrics", (c) => {
      if (!DevelopmentRuntimeRouteGuard.isAuthorized(c.req.raw)) {
        return c.text("Unauthorized", 401);
      }
      return c.json(metrics.getSnapshot());
    });
    root.all("*", async (c) => {
      const context = await host.prepare();
      return context.application.getContainer().resolve(CodemationHonoApiApp).fetch(c.req.raw);
    });

    const server = serve(
      {
        fetch: root.fetch,
        port: httpPort,
        hostname: "127.0.0.1",
      },
      () => {
        void host.prepare().catch((error: unknown) => {
          const exception = error instanceof Error ? error : new Error(String(error));
          bootstrapLogger.error("initial prepare failed", exception);
        });
      },
    );
    new RuntimeDevShutdownController(host, server, bootstrapLogger).bindSignals();
  }

  private resolveHttpPort(): number {
    const raw = process.env.CODEMATION_RUNTIME_HTTP_PORT;
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    throw new Error("Missing or invalid CODEMATION_RUNTIME_HTTP_PORT.");
  }
}
