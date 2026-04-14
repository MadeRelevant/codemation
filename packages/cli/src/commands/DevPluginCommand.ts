import type { DevCommand } from "./DevCommand";
import type { PluginDevConfigFactory } from "../dev/PluginDevConfigFactory";
import { CliPathResolver } from "../path/CliPathResolver";
import type { ConsumerAgentSkillsSyncService } from "../skills/ConsumerAgentSkillsSyncService";

export class DevPluginCommand {
  constructor(
    private readonly pathResolver: CliPathResolver,
    private readonly consumerAgentSkillsSyncService: ConsumerAgentSkillsSyncService,
    private readonly pluginDevConfigFactory: PluginDevConfigFactory,
    private readonly devCommand: DevCommand,
  ) {}

  async execute(args: Readonly<{ pluginRoot: string; watchFramework?: boolean }>): Promise<void> {
    const paths = await this.pathResolver.resolve(args.pluginRoot);
    await this.consumerAgentSkillsSyncService.sync(paths.consumerRoot);
    const pluginConfig = await this.pluginDevConfigFactory.prepare(paths.consumerRoot);
    await this.devCommand.execute({
      commandName: "dev:plugin",
      configPathOverride: pluginConfig.configPath,
      consumerRoot: paths.consumerRoot,
      watchFramework: args.watchFramework,
    });
  }
}
