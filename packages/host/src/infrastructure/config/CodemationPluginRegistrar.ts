import type { Container } from "@codemation/core";
import type { LoggerFactory } from "../../application/logging/Logger";
import type { CodemationApplication } from "../../codemationApplication";
import type { CodemationPlugin } from "../../presentation/config/CodemationPlugin";

export class CodemationPluginRegistrar {
  async apply(args: Readonly<{
    plugins: ReadonlyArray<CodemationPlugin>;
    application: CodemationApplication;
    container: Container;
    loggerFactory: LoggerFactory;
    consumerRoot: string;
    repoRoot: string;
    env: Readonly<Record<string, string | undefined>>;
    workflowSources: ReadonlyArray<string>;
  }>): Promise<void> {
    for (const plugin of args.plugins) {
      await plugin.register({
        application: args.application,
        container: args.container,
        loggerFactory: args.loggerFactory,
        consumerRoot: args.consumerRoot,
        repoRoot: args.repoRoot,
        env: args.env,
        workflowSources: args.workflowSources,
      });
    }
  }
}
