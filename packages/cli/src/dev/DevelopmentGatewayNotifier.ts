import { ApiPaths } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";

export class DevelopmentGatewayNotifier {
  constructor(private readonly cliLogger: Logger) {}

  async notify(
    args: Readonly<{
      gatewayBaseUrl: string;
      developmentServerToken: string;
      payload: Readonly<{
        kind: "buildStarted" | "buildCompleted" | "buildFailed";
        buildVersion?: string;
        message?: string;
      }>;
    }>,
  ): Promise<void> {
    const targetUrl = `${args.gatewayBaseUrl.replace(/\/$/, "")}${ApiPaths.devGatewayNotify()}`;
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-codemation-dev-token": args.developmentServerToken,
        },
        body: JSON.stringify(args.payload),
      });
      if (!response.ok) {
        this.cliLogger.warn(`failed to notify dev gateway status=${response.status}`);
      }
    } catch (error) {
      this.cliLogger.warn(`failed to notify dev gateway: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
