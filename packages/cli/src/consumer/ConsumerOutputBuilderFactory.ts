import type { Logger } from "@codemation/host/next/server";

import { ConsumerOutputBuilder } from "./ConsumerOutputBuilder";
import type { ConsumerBuildOptions } from "./consumerBuildOptions.types";

export class ConsumerOutputBuilderFactory {
  create(
    consumerRoot: string,
    args?: Readonly<{
      buildOptions?: ConsumerBuildOptions;
      configPathOverride?: string;
      logger?: Logger;
    }>,
  ): ConsumerOutputBuilder {
    return new ConsumerOutputBuilder(consumerRoot, args?.logger, args?.buildOptions, args?.configPathOverride);
  }
}
