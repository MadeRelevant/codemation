import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

import { DevHttpProbe } from "./DevHttpProbe";
import { DevNextHostEnvironmentBuilder } from "./DevNextHostEnvironmentBuilder";
import { DevSessionPortsResolver } from "./DevSessionPortsResolver";
import { DevSourceChangeClassifier } from "./DevSourceChangeClassifier";
import { LoopbackPortAllocator } from "./LoopbackPortAllocator";
import { NextHostEdgeSeedLoader } from "./NextHostEdgeSeedLoader";
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
    readonly nextHostEdgeSeedLoader: NextHostEdgeSeedLoader,
    readonly nextHostEnvBuilder: DevNextHostEnvironmentBuilder,
    readonly watchRootsResolver: WatchRootsResolver,
    readonly sourceChangeClassifier: DevSourceChangeClassifier,
  ) {}
}
