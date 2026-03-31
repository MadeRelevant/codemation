import { type Container } from "@codemation/core";
import {
  ApplicationTokens,
  AppContainerFactory,
  AppContainerLifecycle,
  type AppConfig,
  DatabaseMigrations,
  PrismaClient,
  type CommandBus,
  type QueryBus,
} from "@codemation/host";

/**
 * Opens an app container with persistence + command/query buses (no HTTP/WebSocket servers),
 * for CLI tools that dispatch application commands or queries (e.g. user admin).
 */
export class CodemationCliApplicationSession {
  private constructor(private readonly container: Container) {}

  static async open(
    args: Readonly<{
      appConfig: AppConfig;
    }>,
  ): Promise<CodemationCliApplicationSession> {
    const container = await new AppContainerFactory().create({
      appConfig: args.appConfig,
      sharedWorkflowWebsocketServer: null,
    });
    if (args.appConfig.env.CODEMATION_SKIP_STARTUP_MIGRATIONS !== "true") {
      await container.resolve(DatabaseMigrations).migrate();
    }
    return new CodemationCliApplicationSession(container);
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
    await this.container.resolve(AppContainerLifecycle).stop({ stopWebsocketServer: false });
  }

  private getContainer(): Container {
    return this.container;
  }
}
