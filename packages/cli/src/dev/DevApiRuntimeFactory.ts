import { CodemationPluginDiscovery, AppConfigLoader } from "@codemation/host/server";

import { LoopbackPortAllocator } from "./LoopbackPortAllocator";
import { DevApiRuntimeHost } from "./DevApiRuntimeHost";
import { DevApiRuntimeServer } from "./DevApiRuntimeServer";
import type { DevApiRuntimeFactoryArgs, DevApiRuntimeServerHandle } from "./DevApiRuntimeTypes";

export type { DevApiRuntimeContext, DevApiRuntimeFactoryArgs, DevApiRuntimeServerHandle } from "./DevApiRuntimeTypes";

export class DevApiRuntimeFactory {
  constructor(
    private readonly portAllocator: LoopbackPortAllocator,
    private readonly configLoader: AppConfigLoader,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
  ) {}

  async create(args: DevApiRuntimeFactoryArgs): Promise<DevApiRuntimeServerHandle> {
    const httpPort = await this.portAllocator.allocate();
    const workflowWebSocketPort = await this.portAllocator.allocate();
    const runtime = new DevApiRuntimeServer(
      httpPort,
      workflowWebSocketPort,
      new DevApiRuntimeHost(this.configLoader, this.pluginDiscovery, {
        configPathOverride: args.configPathOverride,
        consumerRoot: args.consumerRoot,
        env: {
          ...args.env,
          CODEMATION_WS_PORT: String(workflowWebSocketPort),
          NEXT_PUBLIC_CODEMATION_WS_PORT: String(workflowWebSocketPort),
        },
        runtimeWorkingDirectory: args.runtimeWorkingDirectory,
      }),
    );
    const context = await runtime.start();
    return {
      buildVersion: context.buildVersion,
      httpPort,
      stop: async () => {
        await runtime.stop();
      },
      workflowIds: context.workflowIds,
      workflowWebSocketPort,
    };
  }
}
