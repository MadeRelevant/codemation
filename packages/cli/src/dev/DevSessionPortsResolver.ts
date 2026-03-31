import { ListenPortResolver } from "../runtime/ListenPortResolver";
import { LoopbackPortAllocator } from "./LoopbackPortAllocator";

export class DevSessionPortsResolver {
  constructor(
    private readonly listenPorts: ListenPortResolver,
    private readonly loopbackPorts: LoopbackPortAllocator,
  ) {}

  async resolve(
    args: Readonly<{
      devMode: "packaged-ui" | "watch-framework";
      portEnv: string | undefined;
      gatewayPortEnv: string | undefined;
    }>,
  ): Promise<Readonly<{ nextPort: number; gatewayPort: number }>> {
    const nextPort = this.listenPorts.resolvePrimaryApplicationPort(args.portEnv);
    const gatewayPort =
      this.listenPorts.parsePositiveInteger(args.gatewayPortEnv) ??
      (args.devMode === "packaged-ui" ? nextPort : await this.loopbackPorts.allocate());
    return { nextPort, gatewayPort };
  }
}
