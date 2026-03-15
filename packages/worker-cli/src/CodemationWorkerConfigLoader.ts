import { CodemationConsumerConfigLoader } from "@codemation/frontend";
import type { CodemationConsumerConfigResolution } from "@codemation/frontend/server";

export type WorkerConfigResolution = CodemationConsumerConfigResolution;

export class CodemationWorkerConfigLoader {
  private readonly consumerConfigLoader = new CodemationConsumerConfigLoader();

  async load(args: Readonly<{ consumerRoot: string; configPathOverride?: string }>): Promise<WorkerConfigResolution> {
    return await this.consumerConfigLoader.load(args);
  }
}
