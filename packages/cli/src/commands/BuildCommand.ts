import type { Logger } from "@codemation/host/next/server";
import { CodemationPluginDiscovery } from "@codemation/host/server";

import { ConsumerBuildArtifactsPublisher } from "../build/ConsumerBuildArtifactsPublisher";
import type { ConsumerBuildOptions } from "../consumer/consumerBuildOptions.types";
import { ConsumerOutputBuilderLoader } from "../consumer/Loader";
import { CliPathResolver } from "../path/CliPathResolver";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";

export class BuildCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly pathResolver: CliPathResolver,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
    private readonly artifactsPublisher: ConsumerBuildArtifactsPublisher,
    private readonly tsRuntime: TypeScriptRuntimeConfigurator,
    private readonly outputBuilderLoader: ConsumerOutputBuilderLoader,
  ) {}

  async execute(consumerRoot: string, buildOptions: ConsumerBuildOptions): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.tsRuntime.configure(paths.repoRoot);
    const builder = this.outputBuilderLoader.create(paths.consumerRoot, buildOptions);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    const manifest = await this.artifactsPublisher.publish(snapshot, discoveredPlugins);
    this.cliLogger.info(`Built consumer output: ${snapshot.outputEntryPath}`);
    this.cliLogger.info(`Discovered plugins: ${discoveredPlugins.length}`);
    this.cliLogger.info(`Published build: ${manifest.buildVersion}`);
  }
}
