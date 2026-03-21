import { CodemationConsumerConfigLoader } from "@codemation/host";
import type { CodemationConsumerConfigResolution } from "@codemation/host/server";

export type WorkerConfigResolution = CodemationConsumerConfigResolution;

export class CodemationWorkerConfigLoader {
  private readonly consumerConfigLoader = new CodemationConsumerConfigLoader();

  async load(args: Readonly<{ consumerRoot: string; configPathOverride?: string }>): Promise<WorkerConfigResolution> {
    return await this.consumerConfigLoader.load(args);
  }
}
