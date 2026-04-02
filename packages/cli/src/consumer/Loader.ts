import type { ConsumerBuildOptions } from "./consumerBuildOptions.types";
import { ConsumerOutputBuilderFactory } from "./ConsumerOutputBuilderFactory";
import { ConsumerOutputBuilder } from "./ConsumerOutputBuilder";

export class ConsumerOutputBuilderLoader {
  create(
    consumerRoot: string,
    buildOptions: ConsumerBuildOptions,
    options?: Readonly<{ configPathOverride?: string }>,
  ): ConsumerOutputBuilder {
    return new ConsumerOutputBuilderFactory().create(consumerRoot, {
      buildOptions,
      configPathOverride: options?.configPathOverride,
    });
  }
}
