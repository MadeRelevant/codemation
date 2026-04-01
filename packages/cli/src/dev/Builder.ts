import { CodemationConsumerConfigLoader } from "@codemation/host/server";

import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { ListenPortResolver } from "../runtime/ListenPortResolver";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

import { DevHttpProbe } from "./DevHttpProbe";
import { DevNextHostEnvironmentBuilder } from "./DevNextHostEnvironmentBuilder";
import { DevSessionPortsResolver } from "./DevSessionPortsResolver";
import { DevSessionServices } from "./DevSessionServices";
import { DevSourceChangeClassifier } from "./DevSourceChangeClassifier";
import { LoopbackPortAllocator } from "./LoopbackPortAllocator";
import { NextHostEdgeSeedLoader } from "./NextHostEdgeSeedLoader";
import { WatchRootsResolver } from "./WatchRootsResolver";

export class DevSessionServicesBuilder {
  build(): DevSessionServices {
    const consumerEnvLoader = new ConsumerEnvLoader();
    const sourceMapNodeOptions = new SourceMapNodeOptions();
    const listenPortResolver = new ListenPortResolver();
    const loopbackPortAllocator = new LoopbackPortAllocator();
    return new DevSessionServices(
      consumerEnvLoader,
      sourceMapNodeOptions,
      new DevSessionPortsResolver(listenPortResolver, loopbackPortAllocator),
      loopbackPortAllocator,
      new DevHttpProbe(),
      new NextHostEdgeSeedLoader(new CodemationConsumerConfigLoader(), consumerEnvLoader),
      new DevNextHostEnvironmentBuilder(consumerEnvLoader, sourceMapNodeOptions),
      new WatchRootsResolver(),
      new DevSourceChangeClassifier(),
    );
  }
}
