import type { PersistedWorkflowSnapshot, WorkflowDefinition } from "../../../types";
import type { TypeToken } from "../../../di";
import { PersistedWorkflowConfigSerializer } from "./PersistedWorkflowConfigSerializer";

export class PersistedWorkflowSnapshotFactory {
  private readonly configSerializer = new PersistedWorkflowConfigSerializer();

  create(workflow: WorkflowDefinition): PersistedWorkflowSnapshot {
    return {
      id: workflow.id,
      name: workflow.name,
      nodes: workflow.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        name: node.name,
        nodeTokenId: node.tokenId,
        configTokenId: node.config.tokenId,
        tokenName: this.resolveTokenName(node.token),
        configTokenName: this.resolveTokenName(node.config?.token),
        config: this.configSerializer.create(node.config),
      })),
      edges: workflow.edges.map((edge) => ({
        from: { nodeId: edge.from.nodeId, output: edge.from.output },
        to: { nodeId: edge.to.nodeId, input: edge.to.input },
      })),
    };
  }

  private resolveTokenName(token: TypeToken<unknown>): string | undefined {
    return typeof token === "function" && token.name ? token.name : typeof token === "string" ? token : undefined;
  }
}
