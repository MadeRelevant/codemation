import { type Container } from "@codemation/core";
import {
  ApplicationTokens,
  CodemationApplication,
  CodemationBootstrapRequest,
  PrismaClient,
  type CommandBus,
  type QueryBus,
} from "@codemation/host";
import type { CodemationConsumerConfigResolution } from "@codemation/host/server";

/**
 * Opens a {@link CodemationApplication} with persistence + command/query buses (no HTTP/WebSocket servers),
 * for CLI tools that dispatch application commands or queries (e.g. user admin).
 */
export class CodemationCliApplicationSession {
  private constructor(private readonly application: CodemationApplication) {}

  static async open(
    args: Readonly<{
      resolution: CodemationConsumerConfigResolution;
      bootstrap: CodemationBootstrapRequest;
    }>,
  ): Promise<CodemationCliApplicationSession> {
    const app = new CodemationApplication().useConfig(args.resolution.config);
    await app.bootCli(
      new CodemationBootstrapRequest({
        repoRoot: args.bootstrap.repoRoot,
        consumerRoot: args.bootstrap.consumerRoot,
        env: args.bootstrap.env,
        workflowSources: args.resolution.workflowSources,
      }),
    );
    return new CodemationCliApplicationSession(app);
  }

  getPrismaClient(): PrismaClient | undefined {
    const container = this.getContainer();
    if (!container.isRegistered(PrismaClient, true)) {
      return undefined;
    }
    return container.resolve(PrismaClient);
  }

  getCommandBus(): CommandBus {
    return this.getContainer().resolve(ApplicationTokens.CommandBus);
  }

  getQueryBus(): QueryBus {
    return this.getContainer().resolve(ApplicationTokens.QueryBus);
  }

  async close(): Promise<void> {
    await this.application.stop({ stopWebsocketServer: false });
  }

  private getContainer(): Container {
    return this.application.getContainer();
  }
}
