import { CodemationHonoApiApp, logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { RuntimeDevHost } from "./RuntimeDevHost";
import { RuntimeDevMetrics } from "./RuntimeDevMetrics";
import { RuntimeDevModuleRunner } from "./RuntimeDevModuleRunner";
import { DevelopmentRuntimeRouteGuard } from "@codemation/host/dev-server-sidecar";

export class RuntimeDevServerMain {
  async run(): Promise<void> {
    const metrics = new RuntimeDevMetrics();
    const moduleRunner = new RuntimeDevModuleRunner();
    const host = new RuntimeDevHost(moduleRunner, metrics);
    const loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);
    const bootstrapLogger = loggerFactory.create("codemation-runtime-dev.bootstrap");
    const performanceDiagnosticsLogger = loggerFactory.createPerformanceDiagnostics("codemation-runtime-dev.http");
    const httpPort = this.resolveHttpPort();

    const devApp = new Hono();
    devApp.get("/health", (c) => c.json({ ok: true }));
    devApp.get("/metrics", (c) => {
      if (!DevelopmentRuntimeRouteGuard.isAuthorized(c.req.raw)) {
        return c.text("Unauthorized", 401);
      }
      return c.json(metrics.getSnapshot());
    });
    devApp.post("/reload", async (c) => {
      if (!DevelopmentRuntimeRouteGuard.isAuthorized(c.req.raw)) {
        return c.text("Unauthorized", 401);
      }
      const reloadStarted = performance.now();
      let body: Readonly<{ changedPaths?: ReadonlyArray<string> }> = {};
      try {
        const text = await c.req.text();
        if (text && text.trim().length > 0) {
          body = JSON.parse(text) as Readonly<{ changedPaths?: ReadonlyArray<string> }>;
        }
      } catch {
        return c.text("Invalid JSON body", 400);
      }
      await moduleRunner.invalidateAndReload({
        changedPaths: body.changedPaths ?? [],
      });
      await host.prepare();
      metrics.recordReload(performance.now() - reloadStarted);
      return c.body(null, 204);
    });
    devApp.post("/runtime", async (c) => {
      if (!DevelopmentRuntimeRouteGuard.isAuthorized(c.req.raw)) {
        return c.text("Unauthorized", 401);
      }
      const payload = (await c.req.json()) as Readonly<{
        kind?: unknown;
        buildVersion?: unknown;
        message?: unknown;
      }>;
      const signal = DevelopmentRuntimeRouteGuard.parseSignalFromPayload(payload);
      if (signal.kind === "buildStarted") {
        await host.notifyBuildStarted({
          buildVersion: signal.buildVersion,
        });
        return c.body(null, 204);
      }
      if (signal.kind === "buildCompleted") {
        const buildCompletedStarted = performance.now();
        await host.notifyBuildCompleted({
          buildVersion: signal.buildVersion,
        });
        performanceDiagnosticsLogger.info(
          `POST /dev/runtime buildCompleted ${(performance.now() - buildCompletedStarted).toFixed(1)}ms`,
        );
        return c.body(null, 204);
      }
      await host.notifyBuildFailed({
        message: signal.message,
      });
      return c.body(null, 204);
    });

    const root = new Hono();
    root.route("/dev", devApp);
    root.all("*", async (c) => {
      const context = await host.prepare();
      return context.application.getContainer().resolve(CodemationHonoApiApp).fetch(c.req.raw);
    });

    serve(
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
