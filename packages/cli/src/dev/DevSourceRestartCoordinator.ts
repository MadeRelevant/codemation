import type { Logger } from "@codemation/host/next/server";
import process from "node:process";

import { DevelopmentGatewayNotifier } from "./DevelopmentGatewayNotifier";

export class DevSourceRestartCoordinator {
  constructor(
    private readonly gatewayNotifier: DevelopmentGatewayNotifier,
    private readonly performanceDiagnosticsLogger: Logger,
    private readonly cliLogger: Logger,
  ) {}

  async runHandshakeAfterSourceChange(gatewayBaseUrl: string, developmentServerToken: string): Promise<void> {
    const restartStarted = performance.now();
    try {
      await this.gatewayNotifier.notify({
        gatewayBaseUrl,
        developmentServerToken,
        payload: {
          kind: "buildStarted",
        },
      });
      await this.gatewayNotifier.notify({
        gatewayBaseUrl,
        developmentServerToken,
        payload: {
          kind: "buildCompleted",
          buildVersion: `${Date.now()}-${process.pid}`,
        },
      });
      const totalMs = performance.now() - restartStarted;
      this.performanceDiagnosticsLogger.info(
        `triggered source-based runtime restart timingMs={total:${totalMs.toFixed(1)}}`,
      );
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      await this.gatewayNotifier.notify({
        gatewayBaseUrl,
        developmentServerToken,
        payload: {
          kind: "buildFailed",
          message: exception.message,
        },
      });
      this.cliLogger.error("source-based runtime restart request failed", exception);
    }
  }
}
