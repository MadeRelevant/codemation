import type { NodeDefinition, PersistedWorkflowSnapshotNode } from "../../../types";
import { MissingRuntimeNodeConfig } from "./MissingRuntimeNodeConfig";
import { MissingRuntimeNodeToken } from "./MissingRuntimeNodeToken";
import { MissingRuntimeTriggerConfig } from "./MissingRuntimeTriggerConfig";
import { MissingRuntimeTriggerToken } from "./MissingRuntimeTriggerToken";

export class MissingRuntimeNodeDefinitionFactory {
  create(snapshotNode: PersistedWorkflowSnapshotNode): NodeDefinition {
    if (snapshotNode.kind === "trigger") {
      const config = new MissingRuntimeTriggerConfig(snapshotNode.name ?? snapshotNode.id, snapshotNode.nodeTokenId);
      return {
        id: snapshotNode.id,
        kind: "trigger",
        name: snapshotNode.name,
        token: MissingRuntimeTriggerToken,
        tokenId: config.tokenId,
        config,
      };
    }
    const config = new MissingRuntimeNodeConfig(snapshotNode.name ?? snapshotNode.id, snapshotNode.nodeTokenId);
    return {
      id: snapshotNode.id,
      kind: "node",
      name: snapshotNode.name,
      token: MissingRuntimeNodeToken,
      tokenId: config.tokenId,
      config,
    };
  }
}
