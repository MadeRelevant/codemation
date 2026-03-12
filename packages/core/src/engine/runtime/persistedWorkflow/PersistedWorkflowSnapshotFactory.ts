import type { PersistedTokenId, PersistedWorkflowSnapshot, WorkflowDefinition } from "../../../types";
import type { TypeToken } from "../../../di";
import type { PersistedWorkflowTokenRegistry } from "./PersistedWorkflowTokenRegistry";
import { PersistedWorkflowConfigSerializer } from "./PersistedWorkflowConfigSerializer";

export class PersistedWorkflowSnapshotFactory {
  private readonly configSerializer: PersistedWorkflowConfigSerializer;

  constructor(private readonly tokenRegistry: PersistedWorkflowTokenRegistry) {
    this.configSerializer = new PersistedWorkflowConfigSerializer(tokenRegistry);
  }

  create(workflow: WorkflowDefinition): PersistedWorkflowSnapshot {
    return {
      id: workflow.id,
      name: workflow.name,
      nodes: workflow.nodes.map((node) => {
        const nodeTokenId = this.resolveTokenId(node.type);
        const configTokenId = this.resolveTokenId(node.config.type);
        return {
          id: node.id,
          kind: node.kind,
          name: node.name,
          nodeTokenId,
          configTokenId,
          tokenName: this.resolveTokenName(node.type),
          configTokenName: this.resolveTokenName(node.config?.type),
          config: this.configSerializer.create(node.config),
        };
      }),
      edges: workflow.edges.map((edge) => ({
        from: { nodeId: edge.from.nodeId, output: edge.from.output },
        to: { nodeId: edge.to.nodeId, input: edge.to.input },
      })),
    };
  }

  private resolveTokenId(token: TypeToken<unknown>): PersistedTokenId {
    const id = this.tokenRegistry.getTokenId(token);
    if (id) return id;
    const name = typeof token === "function" && token.name ? token.name : typeof token === "string" ? token : "unknown";
    return name as PersistedTokenId;
  }

  private resolveTokenName(token: TypeToken<unknown>): string | undefined {
    return typeof token === "function" && token.name ? token.name : typeof token === "string" ? token : undefined;
  }
}
