import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

import { DevAuthSettingsLoader } from "./DevAuthSettingsLoader";
import { DevHttpProbe } from "./DevHttpProbe";
import { DevNextHostEnvironmentBuilder } from "./DevNextHostEnvironmentBuilder";
import { DevSessionPortsResolver } from "./DevSessionPortsResolver";
import { DevSourceChangeClassifier } from "./DevSourceChangeClassifier";
import { LoopbackPortAllocator } from "./LoopbackPortAllocator";
import { WatchRootsResolver } from "./WatchRootsResolver";

/**
 * Bundles dependencies for {@link DevCommand} so the command stays a thin orchestrator.
 */
export class DevSessionServices {
  constructor(
    readonly consumerEnvLoader: ConsumerEnvLoader,
    readonly sourceMapNodeOptions: SourceMapNodeOptions,
    readonly sessionPorts: DevSessionPortsResolver,
    readonly loopbackPortAllocator: LoopbackPortAllocator,
    readonly devHttpProbe: DevHttpProbe,
    readonly devAuthLoader: DevAuthSettingsLoader,
    readonly nextHostEnvBuilder: DevNextHostEnvironmentBuilder,
    readonly watchRootsResolver: WatchRootsResolver,
    readonly sourceChangeClassifier: DevSourceChangeClassifier,
  ) {}
}
