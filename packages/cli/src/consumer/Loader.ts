import type { ConsumerBuildOptions } from "./consumerBuildOptions.types";
import { ConsumerOutputBuilder } from "./ConsumerOutputBuilder";

export class ConsumerOutputBuilderLoader {
  create(consumerRoot: string, buildOptions: ConsumerBuildOptions): ConsumerOutputBuilder {
    return new ConsumerOutputBuilder(consumerRoot, undefined, buildOptions);
  }
}
