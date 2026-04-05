import type { Container } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import type { PrismaDatabaseClient } from "../infrastructure/persistence/PrismaDatabaseClient";
import { WorkflowRunEventWebsocketRelay } from "../application/websocket/WorkflowRunEventWebsocketRelay";
import { WorkflowWebsocketServer } from "../presentation/websocket/WorkflowWebsocketServer";

export class AppContainerLifecycle {
  constructor(
    private readonly container: Container,
    private readonly ownedPrismaClient: PrismaDatabaseClient | null,
  ) {}

  async stop(args?: Readonly<{ stopWebsocketServer?: boolean }>): Promise<void> {
    if (this.container.isRegistered(Engine, true)) {
      await this.container.resolve(Engine).stop();
    }
    if (this.container.isRegistered(WorkflowRunEventWebsocketRelay, true)) {
      await this.container.resolve(WorkflowRunEventWebsocketRelay).stop();
    }
    if (args?.stopWebsocketServer !== false && this.container.isRegistered(WorkflowWebsocketServer, true)) {
      await this.container.resolve(WorkflowWebsocketServer).stop();
    }
    if (this.ownedPrismaClient) {
      await this.ownedPrismaClient.$disconnect();
    }
  }
}
