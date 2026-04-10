import { ListenPortResolver } from "../runtime/ListenPortResolver";
import { LoopbackPortAllocator } from "./LoopbackPortAllocator";
import type { ListenPortConflictDescriber } from "./ListenPortConflictDescriber";

export class DevSessionPortsResolver {
  constructor(
    private readonly listenPorts: ListenPortResolver,
    private readonly loopbackPorts: LoopbackPortAllocator,
    private readonly portConflictDescriber?: ListenPortConflictDescriber,
  ) {}

  async resolve(
    args: Readonly<{
      devMode: "packaged-ui" | "watch-framework";
      portEnv: string | undefined;
      gatewayPortEnv: string | undefined;
    }>,
  ): Promise<Readonly<{ nextPort: number; gatewayPort: number }>> {
    const primaryPort = this.listenPorts.resolvePrimaryApplicationPort(args.portEnv);
    const configuredGatewayPort = this.listenPorts.parsePositiveInteger(args.gatewayPortEnv);
    const gatewayPort = configuredGatewayPort ?? primaryPort;
    if (args.devMode === "packaged-ui") {
      // Packaged UI: the stable gateway owns the public port; the UI runs behind it.
      return { nextPort: primaryPort, gatewayPort };
    }
    // Watch-framework: keep the gateway on the public port so Windows↔WSL loopback forwarding is stable (WS + HTTP).
    // Run Next dev on an internal loopback port behind the gateway.
    const preferredNextDevPort = gatewayPort + 1;
    if (this.portConflictDescriber) {
      const conflict = await this.portConflictDescriber.describeLoopbackPort(preferredNextDevPort);
      if (!conflict) {
        return { nextPort: preferredNextDevPort, gatewayPort };
      }
    }
    return { nextPort: await this.loopbackPorts.allocate(), gatewayPort };
  }
}
