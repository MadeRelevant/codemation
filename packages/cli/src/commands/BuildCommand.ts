import type { Logger } from "@codemation/host/next/server";

import type { ConsumerOutputBuilderFactory } from "../consumer/ConsumerOutputBuilderFactory";
import type { ConsumerBuildOptions } from "../consumer/consumerBuildOptions.types";
import { CliPathResolver } from "../path/CliPathResolver";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";

export class BuildCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly pathResolver: CliPathResolver,
    private readonly consumerOutputBuilderFactory: ConsumerOutputBuilderFactory,
    private readonly tsRuntime: TypeScriptRuntimeConfigurator,
  ) {}

  async execute(consumerRoot: string, buildOptions: ConsumerBuildOptions): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.tsRuntime.configure(paths.repoRoot);
    const builder = this.consumerOutputBuilderFactory.create(paths.consumerRoot, { buildOptions });
    const snapshot = await builder.ensureBuilt();
    this.cliLogger.info(`Built consumer output: ${snapshot.outputEntryPath}`);
    this.cliLogger.info(`Workflow modules emitted: ${snapshot.workflowSourcePaths.length}`);
  }
}
