import type { NodeOutputs,OutputPortKey } from "../../types";

export class OutputStats {
  static toItemsOutByPort(outputs: NodeOutputs): Record<OutputPortKey, number> {
    const out: Record<OutputPortKey, number> = {};
    for (const [port, produced] of Object.entries(outputs)) {
      out[port] = produced?.length ?? 0;
    }
    return out;
  }
}
