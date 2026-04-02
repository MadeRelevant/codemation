import type { DevCommand } from "./DevCommand";
import type { PluginDevConfigFactory } from "../dev/PluginDevConfigFactory";

export class DevPluginCommand {
  constructor(
    private readonly pluginDevConfigFactory: PluginDevConfigFactory,
    private readonly devCommand: DevCommand,
  ) {}

  async execute(args: Readonly<{ pluginRoot: string; watchFramework?: boolean }>): Promise<void> {
    const pluginConfig = await this.pluginDevConfigFactory.prepare(args.pluginRoot);
    await this.devCommand.execute({
      commandName: "dev:plugin",
      configPathOverride: pluginConfig.configPath,
      consumerRoot: args.pluginRoot,
      watchFramework: args.watchFramework,
    });
  }
}
