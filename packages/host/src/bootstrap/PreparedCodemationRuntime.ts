import type { PGlite } from "@electric-sql/pglite";
import type { Container } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { WorkflowRunEventWebsocketRelay } from "../application/websocket/WorkflowRunEventWebsocketRelay";
import type { BootRuntimeSummary } from "../application/dev/BootRuntimeSummary.types";
import type { PrismaClient } from "../infrastructure/persistence/generated/prisma-client/client.js";
import { WorkflowWebsocketServer } from "../presentation/websocket/WorkflowWebsocketServer";
import type { ResolvedImplementationSelection } from "./runtime/ResolvedImplementationSelectionFactory";

export class PreparedCodemationRuntime {
  constructor(
    readonly container: Container,
    readonly runtimeSummary: BootRuntimeSummary,
    readonly implementationSelection: ResolvedImplementationSelection,
    readonly usesProvidedPrismaClientOverride: boolean,
    private readonly ownedPrismaClient: PrismaClient | null,
    private readonly ownedPglite: PGlite | null,
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
    if (this.ownedPglite) {
      await this.ownedPglite.close();
    }
  }
}
