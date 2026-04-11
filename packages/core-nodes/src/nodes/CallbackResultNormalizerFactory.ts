import type { Items, PortsEmission } from "@codemation/core";
import { emitPorts, isPortsEmission } from "@codemation/core";

export class CallbackResultNormalizer {
  static toPortsEmission(result: Items | PortsEmission | void, items: Items): PortsEmission {
    if (isPortsEmission(result)) {
      return result;
    }
    return emitPorts({ main: result ?? items });
  }
}
