import type { ConnectionInvocationRecord } from "./realtimeDomainTypes";

export class CurrentStatusLabelSelector {
  static select(
    connectionNodeId: string,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord> | undefined,
  ): string | undefined {
    if (!connectionInvocations || connectionInvocations.length === 0) {
      return undefined;
    }
    let bestLabel: string | undefined;
    let bestUpdatedAt = "";
    for (const inv of connectionInvocations) {
      if (inv.connectionNodeId !== connectionNodeId) continue;
      if (typeof inv.statusLabel !== "string" || inv.statusLabel.length === 0) continue;
      if (inv.updatedAt >= bestUpdatedAt) {
        bestUpdatedAt = inv.updatedAt;
        bestLabel = inv.statusLabel;
      }
    }
    return bestLabel;
  }
}
