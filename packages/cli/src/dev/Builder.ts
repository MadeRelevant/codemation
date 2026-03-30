import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import type { ServerLoggerFactory } from "@codemation/host/next/server";

import { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";
import { ListenPortResolver } from "../runtime/ListenPortResolver";
import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

import { DevelopmentGatewayNotifier } from "./DevelopmentGatewayNotifier";
import { DevAuthSettingsLoader } from "./DevAuthSettingsLoader";
import { DevHttpProbe } from "./DevHttpProbe";
import { DevNextHostEnvironmentBuilder } from "./DevNextHostEnvironmentBuilder";
import { DevSessionPortsResolver } from "./DevSessionPortsResolver";
import { DevSessionServices } from "./DevSessionServices";
import { DevSourceChangeClassifier } from "./DevSourceChangeClassifier";
import { DevSourceRestartCoordinator } from "./DevSourceRestartCoordinator";
import { LoopbackPortAllocator } from "./LoopbackPortAllocator";
import { RuntimeToolEntrypointResolver } from "./RuntimeToolEntrypointResolver";
import { WatchRootsResolver } from "./WatchRootsResolver";

export class DevSessionServicesBuilder {
  constructor(private readonly loggerFactory: ServerLoggerFactory) {}

  build(): DevSessionServices {
    const consumerEnvLoader = new ConsumerEnvLoader();
    const sourceMapNodeOptions = new SourceMapNodeOptions();
    const listenPortResolver = new ListenPortResolver();
    const loopbackPortAllocator = new LoopbackPortAllocator();
    const cliLogger = this.loggerFactory.create("codemation-cli");
    return new DevSessionServices(
      consumerEnvLoader,
      sourceMapNodeOptions,
      new DevSessionPortsResolver(listenPortResolver, loopbackPortAllocator),
      loopbackPortAllocator,
      new DevHttpProbe(),
      new RuntimeToolEntrypointResolver(),
      new DevAuthSettingsLoader(new CodemationConsumerConfigLoader(), consumerEnvLoader),
      new DevNextHostEnvironmentBuilder(consumerEnvLoader, sourceMapNodeOptions),
      new WatchRootsResolver(),
      new DevSourceChangeClassifier(),
      new DevSourceRestartCoordinator(
        new DevelopmentGatewayNotifier(cliLogger),
        this.loggerFactory.createPerformanceDiagnostics("codemation-cli.performance"),
        cliLogger,
      ),
    );
  }
}
