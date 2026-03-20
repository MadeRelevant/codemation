import type { NodeId,NodeOutputs } from "../../types";

export class RuntimeContinuationDiagnostics {
  static formatNodeLabel(args: { definition?: Readonly<{ id: NodeId; name?: string; type: unknown }>; nodeId: NodeId }): string {
    const tokenName = typeof args.definition?.type === "function" ? args.definition.type.name : "Node";
    return args.definition?.name ? `"${args.definition.name}" (${tokenName}:${args.nodeId})` : `${tokenName}:${args.nodeId}`;
  }

  static formatOutputCounts(outputs: NodeOutputs): string {
    const entries = Object.entries(outputs ?? {});
    if (entries.length === 0) {
      return "no outputs";
    }
    return entries.map(([port, items]) => `${port}=${items?.length ?? 0}`).join(", ");
  }
}
