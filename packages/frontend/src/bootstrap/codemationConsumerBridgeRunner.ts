import { CodemationConsumerRegistry } from "./codemationConsumerRegistry";
import type { CodemationConsumerBridge, CodemationConsumerBridgeContext, CodemationConsumerBridgeType } from "./codemationBootstrapTypes";

export class CodemationConsumerBridgeRunner {
  async run(args: Readonly<{
    bridgeType: CodemationConsumerBridgeType | undefined;
    context: Omit<CodemationConsumerBridgeContext, "registry">;
  }>): Promise<void> {
    if (!args.bridgeType) return;
    const registry = new CodemationConsumerRegistry(args.context.container);
    const bridge = registry.resolveClass(args.bridgeType);
    await bridge.register({
      ...args.context,
      registry,
    });
  }
}
