import type { Logger } from "@codemation/host/next/server";
import { CodemationPluginDiscovery } from "@codemation/host/server";

import { ConsumerBuildArtifactsPublisher } from "../build/ConsumerBuildArtifactsPublisher";
import { ConsumerBuildOptionsParser } from "../build/ConsumerBuildOptionsParser";
import { ConsumerOutputBuilderLoader } from "../consumer/Loader";
import type { CliPaths } from "../path/CliPathResolver";

/**
 * Ensures `.codemation/output/current.json` and transpiled consumer config exist before the Next host boots.
 * Without this, `codemation dev` can serve a stale built `codemation.config.js` (e.g. missing whitelabel).
 */
export class DevConsumerPublishBootstrap {
  constructor(
    private readonly cliLogger: Logger,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
    private readonly artifactsPublisher: ConsumerBuildArtifactsPublisher,
    private readonly outputBuilderLoader: ConsumerOutputBuilderLoader,
    private readonly buildOptionsParser: ConsumerBuildOptionsParser,
  ) {}

  async ensurePublished(paths: CliPaths): Promise<void> {
    const buildOptions = this.buildOptionsParser.parse({});
    const builder = this.outputBuilderLoader.create(paths.consumerRoot, buildOptions);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    await this.artifactsPublisher.publish(snapshot, discoveredPlugins);
    this.cliLogger.debug(`Dev: consumer output published (${snapshot.buildVersion}).`);
  }
}
