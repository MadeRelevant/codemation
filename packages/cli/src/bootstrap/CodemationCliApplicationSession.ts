import { CodemationApplication, type CommandBus } from "@codemation/host";
import type { CodemationConsumerConfigResolution } from "@codemation/host/server";

/**
 * Opens a {@link CodemationApplication} with persistence + command bus only (no HTTP/WebSocket servers),
 * for CLI tools that dispatch application commands (e.g. local user bootstrap).
 */
export class CodemationCliApplicationSession {
  private constructor(private readonly application: CodemationApplication) {}

  static async open(
    args: Readonly<{
      resolution: CodemationConsumerConfigResolution;
      repoRoot: string;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): Promise<CodemationCliApplicationSession> {
    const app = new CodemationApplication().useConfig(args.resolution.config);
    await app.prepareCliPersistenceAndCommands({ repoRoot: args.repoRoot, env: args.env });
    return new CodemationCliApplicationSession(app);
  }

  getCommandBus(): CommandBus {
    return this.application.getCommandBus();
  }

  async close(): Promise<void> {
    await this.application.stopFrontendServerContainer({ stopWebsocketServer: false });
  }
}
