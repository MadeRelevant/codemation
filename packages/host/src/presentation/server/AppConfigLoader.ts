import type { AppConfig } from "../config/AppConfig";
import { CodemationConsumerConfigLoader } from "./CodemationConsumerConfigLoader";
import { AppConfigFactory } from "../../bootstrap/runtime/AppConfigFactory";

export type AppConfigLoadResult = Readonly<{
  appConfig: AppConfig;
  bootstrapSource: string | null;
}>;

export class AppConfigLoader {
  constructor(
    private readonly consumerConfigLoader: CodemationConsumerConfigLoader = new CodemationConsumerConfigLoader(),
    private readonly appConfigFactory: AppConfigFactory = new AppConfigFactory(),
  ) {}

  async load(
    args: Readonly<{
      consumerRoot: string;
      repoRoot: string;
      env: NodeJS.ProcessEnv;
      configPathOverride?: string;
    }>,
  ): Promise<AppConfigLoadResult> {
    const resolution = await this.consumerConfigLoader.load({
      consumerRoot: args.consumerRoot,
      configPathOverride: args.configPathOverride,
    });
    return {
      appConfig: this.appConfigFactory.create({
        repoRoot: args.repoRoot,
        consumerRoot: args.consumerRoot,
        env: args.env,
        config: resolution.config,
        workflowSources: resolution.workflowSources,
      }),
      bootstrapSource: resolution.bootstrapSource,
    };
  }
}
