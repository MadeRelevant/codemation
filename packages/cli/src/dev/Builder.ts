import { CodemationConsumerConfigLoader } from "@codemation/host/server";

import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { ListenPortResolver } from "../runtime/ListenPortResolver";
import { DevelopmentConditionNodeOptions } from "../runtime/DevelopmentConditionNodeOptions";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

import { DevHttpProbe } from "./DevHttpProbe";
import { DevNextHostEnvironmentBuilder } from "./DevNextHostEnvironmentBuilder";
import { DevSessionPortsResolver } from "./DevSessionPortsResolver";
import { DevSessionServices } from "./DevSessionServices";
import { DevSourceChangeClassifier } from "./DevSourceChangeClassifier";
import { ListenPortConflictDescriber } from "./ListenPortConflictDescriber";
import { LoopbackPortAllocator } from "./LoopbackPortAllocator";
import { NextHostPortAvailabilityGuard } from "./NextHostPortAvailabilityGuard";
import { NextHostEdgeSeedLoader } from "./NextHostEdgeSeedLoader";
import { WatchRootsResolver } from "./WatchRootsResolver";

export class DevSessionServicesBuilder {
  build(): DevSessionServices {
    const consumerEnvLoader = new ConsumerEnvLoader();
    const sourceMapNodeOptions = new SourceMapNodeOptions();
    const developmentConditionNodeOptions = new DevelopmentConditionNodeOptions();
    const listenPortResolver = new ListenPortResolver();
    const loopbackPortAllocator = new LoopbackPortAllocator();
    const portConflictDescriber = new ListenPortConflictDescriber();
    return new DevSessionServices(
      consumerEnvLoader,
      sourceMapNodeOptions,
      developmentConditionNodeOptions,
      new DevSessionPortsResolver(listenPortResolver, loopbackPortAllocator, portConflictDescriber),
      loopbackPortAllocator,
      new DevHttpProbe(),
      new NextHostEdgeSeedLoader(new CodemationConsumerConfigLoader(), consumerEnvLoader),
      new DevNextHostEnvironmentBuilder(consumerEnvLoader, sourceMapNodeOptions, developmentConditionNodeOptions),
      new NextHostPortAvailabilityGuard(portConflictDescriber),
      new WatchRootsResolver(),
      new DevSourceChangeClassifier(),
    );
  }
}
