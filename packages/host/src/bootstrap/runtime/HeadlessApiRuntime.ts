import type { AppConfig } from "../../presentation/config/AppConfig";
import type { AppContainerFactory } from "../AppContainerFactory";
import { FrontendRuntime } from "./FrontendRuntime";
import { CodemationHonoApiApp } from "../../presentation/http/hono/CodemationHonoApiAppFactory";
import type { WorkflowWebsocketServerFactory } from "../../presentation/websocket/WorkflowWebsocketServerFactory";
import type { HeadlessHttpServerFactory } from "../../presentation/http/HeadlessHttpServerFactory";
import type { Logger } from "../../application/logging/Logger";

/**
 * Boots the Codemation API + WebSocket servers without the Next.js UI process.
 * Used by `codemation serve web --headless` for workspace pod containers where the
 * UI is served externally (e.g. from the control-plane's customer-ui).
 */
export class HeadlessApiRuntime {
  constructor(
    private readonly appContainerFactory: AppContainerFactory,
    private readonly websocketServerFactory: WorkflowWebsocketServerFactory,
    private readonly httpServerFactory: HeadlessHttpServerFactory,
    private readonly logger: Logger,
  ) {}

  async start(appConfig: AppConfig): Promise<void> {
    const port = Number(appConfig.env.PORT ?? 4001);

    this.logger.info(`Starting codemation headless API runtime`);
    this.logger.info(`HTTP port: ${port}, WS port: ${appConfig.webSocketPort}`);

    const websocketServer = this.websocketServerFactory.create(appConfig);

    const container = await this.appContainerFactory.create({
      appConfig,
      sharedWorkflowWebsocketServer: websocketServer,
    });

    await container.resolve(FrontendRuntime).start();

    const honoApp = container.resolve(CodemationHonoApiApp);
    const httpServer = this.httpServerFactory.create(honoApp, port, this.logger);

    await new Promise<void>((resolve) => {
      httpServer.listen(port, () => {
        this.logger.info(`codemation headless API listening on port ${port}`);
        resolve();
      });
    });
  }
}
