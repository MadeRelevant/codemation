import type { NodeDefinition, WorkflowDefinition, WorkflowNodeConnection } from "@codemation/core";
import { AgentConfigInspector, AgentConnectionNodeCollector } from "@codemation/core";

import { AIAgentNode } from "../nodes/AIAgentNode";
import { ConnectionCredentialNode } from "../nodes/ConnectionCredentialNode";
import { ConnectionCredentialNodeConfigFactory } from "../nodes/ConnectionCredentialNodeConfigFactory";

/**
 * Materializes connection-owned child nodes and {@link WorkflowDefinition.connections} for AI agent nodes.
 */
export class AIAgentConnectionWorkflowExpander {
  constructor(private readonly connectionCredentialNodeConfigFactory: ConnectionCredentialNodeConfigFactory) {}

  expand(workflow: WorkflowDefinition): WorkflowDefinition {
    const existingChildIds = this.collectExistingChildIds(workflow);
    const connectionsByParentAndName = this.createConnectionsByParentAndName(workflow);
    const extraNodes: NodeDefinition[] = [];
    let connectionsChanged = false;

    for (const node of workflow.nodes) {
      if (node.type !== AIAgentNode || !AgentConfigInspector.isAgentNodeConfig(node.config)) {
        continue;
      }
      for (const connectionNode of AgentConnectionNodeCollector.collect(node.id, node.config)) {
        if (!existingChildIds.has(connectionNode.nodeId)) {
          this.assertNoIdCollision(workflow, extraNodes, existingChildIds, connectionNode.nodeId);
          extraNodes.push({
            id: connectionNode.nodeId,
            kind: "node",
            type: ConnectionCredentialNode,
            name: connectionNode.name,
            config: this.connectionCredentialNodeConfigFactory.create(
              connectionNode.typeName,
              connectionNode.credentialSource,
            ),
          });
        }
        const connectionKey = this.connectionKey(connectionNode.parentNodeId, connectionNode.connectionName);
        const existingConnection = connectionsByParentAndName.get(connectionKey);
        if (!existingConnection) {
          connectionsByParentAndName.set(connectionKey, {
            parentNodeId: connectionNode.parentNodeId,
            connectionName: connectionNode.connectionName,
            childNodeIds: [connectionNode.nodeId],
          });
          connectionsChanged = true;
          continue;
        }
        if (!existingConnection.childNodeIds.includes(connectionNode.nodeId)) {
          connectionsByParentAndName.set(connectionKey, {
            ...existingConnection,
            childNodeIds: [...existingConnection.childNodeIds, connectionNode.nodeId],
          });
          connectionsChanged = true;
        }
      }
    }

    if (extraNodes.length === 0 && !connectionsChanged) {
      return workflow;
    }

    return {
      ...workflow,
      nodes: [...workflow.nodes, ...extraNodes],
      connections: [...connectionsByParentAndName.values()],
    };
  }

  private createConnectionsByParentAndName(workflow: WorkflowDefinition): Map<string, WorkflowNodeConnection> {
    const existingByParentAndName = new Map<string, WorkflowNodeConnection>();
    for (const connection of workflow.connections ?? []) {
      existingByParentAndName.set(this.connectionKey(connection.parentNodeId, connection.connectionName), connection);
    }
    return existingByParentAndName;
  }

  private collectExistingChildIds(workflow: WorkflowDefinition): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const connection of workflow.connections ?? []) {
      for (const childId of connection.childNodeIds) {
        ids.add(childId);
      }
    }
    return ids;
  }

  private connectionKey(parentNodeId: string, connectionName: string): string {
    return `${parentNodeId}\0${connectionName}`;
  }

  private assertNoIdCollision(
    workflow: WorkflowDefinition,
    pending: ReadonlyArray<NodeDefinition>,
    existingChildIds: ReadonlySet<string>,
    id: string,
  ): void {
    if (pending.some((n) => n.id === id)) {
      throw new Error(
        `AIAgent connection expansion: node id "${id}" already exists. Rename the conflicting node or adjust the workflow.`,
      );
    }
    if (workflow.nodes.some((n) => n.id === id) && !existingChildIds.has(id)) {
      throw new Error(
        `AIAgent connection expansion: node id "${id}" already exists. Rename the conflicting node or adjust the workflow.`,
      );
    }
  }
}
