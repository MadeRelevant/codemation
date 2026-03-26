import { CodemationApplication, PrismaClient, type CommandBus, type QueryBus } from "@codemation/host";
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
      repoRoot: string;
      consumerRoot: string;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): Promise<CodemationCliApplicationSession> {
    const app = new CodemationApplication().useConfig(args.resolution.config);
    await app.prepareCliPersistenceAndCommands({
      repoRoot: args.repoRoot,
      consumerRoot: args.consumerRoot,
      env: args.env,
    });
    return new CodemationCliApplicationSession(app);
  }

  getPrismaClient(): PrismaClient | undefined {
    const container = this.application.getContainer();
    if (!container.isRegistered(PrismaClient, true)) {
      return undefined;
    }
    return container.resolve(PrismaClient);
  }

  getCommandBus(): CommandBus {
    return this.application.getCommandBus();
  }

  getQueryBus(): QueryBus {
    return this.application.getQueryBus();
  }

  async close(): Promise<void> {
    await this.application.stopFrontendServerContainer({ stopWebsocketServer: false });
  }
}
