import type { NodeConfigBase } from "../../../types";

export class PersistedWorkflowConfigSerializer {
  create(config: NodeConfigBase): unknown {
    try {
      return JSON.parse(JSON.stringify(config)) as unknown;
    } catch {
      return {
        kind: config.kind,
        tokenId: config.tokenId,
        name: config.name,
        id: config.id,
        icon: config.icon,
        execution: config.execution,
      } satisfies Partial<NodeConfigBase>;
    }
  }
}
