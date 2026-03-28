import type { NodeDefinition, PersistedWorkflowSnapshotNode } from "../types";

import { MissingRuntimeNodeConfig } from "./MissingRuntimeNodeConfig";
import { MissingRuntimeNodeToken } from "./MissingRuntimeNodeToken";
import { MissingRuntimeTriggerConfig } from "./MissingRuntimeTriggerConfig";
import { MissingRuntimeTriggerToken } from "./MissingRuntimeTriggerToken";

export class MissingRuntimeFallbacks {
  createDefinition(snapshotNode: PersistedWorkflowSnapshotNode): NodeDefinition {
    if (snapshotNode.kind === "trigger") {
      return {
        id: snapshotNode.id,
        kind: "trigger",
        name: snapshotNode.name,
        type: MissingRuntimeTriggerToken,
        config: new MissingRuntimeTriggerConfig(snapshotNode.name ?? snapshotNode.id, snapshotNode.nodeTokenId),
      };
    }
    return {
      id: snapshotNode.id,
      kind: "node",
      name: snapshotNode.name,
      type: MissingRuntimeNodeToken,
      config: new MissingRuntimeNodeConfig(snapshotNode.name ?? snapshotNode.id, snapshotNode.nodeTokenId),
    };
  }
}
