import { CodemationPluginDiscovery } from "@codemation/host/server";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import { ConsumerBuildArtifactsPublisher } from "../build/ConsumerBuildArtifactsPublisher";
import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import type { ConsumerBuildOptions } from "../consumer/consumerBuildOptions.types";
import { ConsumerOutputBuilderLoader } from "../consumer/Loader";
import { CliPathResolver } from "../path/CliPathResolver";
import { ListenPortResolver } from "../runtime/ListenPortResolver";
import { NextHostConsumerServerCommandFactory } from "../runtime/NextHostConsumerServerCommandFactory";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";

export class ServeWebCommand {
  private readonly require = createRequire(import.meta.url);

  constructor(
    private readonly pathResolver: CliPathResolver,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
    private readonly artifactsPublisher: ConsumerBuildArtifactsPublisher,
    private readonly tsRuntime: TypeScriptRuntimeConfigurator,
    private readonly sourceMapNodeOptions: SourceMapNodeOptions,
    private readonly outputBuilderLoader: ConsumerOutputBuilderLoader,
    private readonly envLoader: ConsumerEnvLoader,
    private readonly listenPortResolver: ListenPortResolver,
    private readonly nextHostConsumerServerCommandFactory: NextHostConsumerServerCommandFactory,
  ) {}

  async execute(consumerRoot: string, buildOptions: ConsumerBuildOptions): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.tsRuntime.configure(paths.repoRoot);
    const builder = this.outputBuilderLoader.create(paths.consumerRoot, buildOptions);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    const manifest = await this.artifactsPublisher.publish(snapshot, discoveredPlugins);
    const nextHostRoot = path.dirname(this.require.resolve("@codemation/next-host/package.json"));
    const nextHostCommand = await this.nextHostConsumerServerCommandFactory.create({ nextHostRoot });
    const consumerEnv = this.envLoader.load(paths.consumerRoot);
    const nextPort = this.listenPortResolver.resolvePrimaryApplicationPort(process.env.PORT);
    const websocketPort = this.listenPortResolver.resolveWebsocketPortRelativeToHttp({
      nextPort,
      publicWebsocketPort: process.env.NEXT_PUBLIC_CODEMATION_WS_PORT,
      websocketPort: process.env.CODEMATION_WS_PORT,
    });
    const child = spawn(nextHostCommand.command, nextHostCommand.args, {
      cwd: nextHostCommand.cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        ...consumerEnv,
        PORT: String(nextPort),
        CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH: manifest.manifestPath,
        CODEMATION_CONSUMER_ROOT: paths.consumerRoot,
        CODEMATION_WS_PORT: String(websocketPort),
        NEXT_PUBLIC_CODEMATION_WS_PORT: String(websocketPort),
        NODE_OPTIONS: this.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
        WS_NO_BUFFER_UTIL: "1",
        WS_NO_UTF_8_VALIDATE: "1",
      },
    });
    await new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        if ((code ?? 0) === 0) {
          resolve();
          return;
        }
        reject(new Error(`next start exited with code ${code ?? 0}.`));
      });
      child.on("error", reject);
    });
  }
}
