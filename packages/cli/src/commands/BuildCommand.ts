import type { CodemationPluginDiscovery } from "@codemation/host/server";
import type { Logger } from "@codemation/host/next/server";

import type { ConsumerBuildArtifactsPublisher } from "../build/ConsumerBuildArtifactsPublisher";
import type { ConsumerOutputBuilderFactory } from "../consumer/ConsumerOutputBuilderFactory";
import type { ConsumerBuildOptions } from "../consumer/consumerBuildOptions.types";
import { CliPathResolver } from "../path/CliPathResolver";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";
import type { ConsumerAgentSkillsSyncService } from "../skills/ConsumerAgentSkillsSyncService";

export class BuildCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly pathResolver: CliPathResolver,
    private readonly consumerAgentSkillsSyncService: ConsumerAgentSkillsSyncService,
    private readonly consumerOutputBuilderFactory: ConsumerOutputBuilderFactory,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
    private readonly consumerBuildArtifactsPublisher: ConsumerBuildArtifactsPublisher,
    private readonly tsRuntime: TypeScriptRuntimeConfigurator,
  ) {}

  async execute(consumerRoot: string, buildOptions: ConsumerBuildOptions): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    await this.consumerAgentSkillsSyncService.sync(paths.consumerRoot);
    this.tsRuntime.configure(paths.repoRoot);
    const builder = this.consumerOutputBuilderFactory.create(paths.consumerRoot, { buildOptions });
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    const manifest = await this.consumerBuildArtifactsPublisher.publish(snapshot, discoveredPlugins);
    this.cliLogger.info(`Built consumer output: ${snapshot.outputEntryPath}`);
    this.cliLogger.info(`Build manifest: ${manifest.manifestPath}`);
    this.cliLogger.info(`Workflow modules emitted: ${snapshot.workflowSourcePaths.length}`);
  }
}
