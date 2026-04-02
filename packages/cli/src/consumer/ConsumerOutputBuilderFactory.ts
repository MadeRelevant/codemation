import type { Logger } from "@codemation/host/next/server";

import { ConsumerOutputBuilder } from "./ConsumerOutputBuilder";
import type { ConsumerBuildOptions } from "./consumerBuildOptions.types";

/**
 * Composition-root helper for {@link ConsumerOutputBuilder}: keeps CLI wiring lint-clean (no ad-hoc `new` in
 * unrelated modules) and centralizes optional logger / build options for consumer output generation.
 */
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
