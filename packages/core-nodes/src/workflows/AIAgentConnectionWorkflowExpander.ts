import type { NodeDefinition, WorkflowDefinition, WorkflowNodeConnection } from "@codemation/core";
import { AgentConfigInspector, ConnectionNodeIdFactory } from "@codemation/core";

import { AIAgentNode } from "../nodes/AIAgentNode";
import { ConnectionCredentialNode } from "../nodes/ConnectionCredentialNode";
import { ConnectionCredentialNodeConfigFactory } from "../nodes/ConnectionCredentialNodeConfigFactory";

/**
 * Materializes connection-owned child nodes and {@link WorkflowDefinition.connections} for AI agent nodes.
 */
export class AIAgentConnectionWorkflowExpander {
  constructor(private readonly connectionCredentialNodeConfigFactory: ConnectionCredentialNodeConfigFactory) {}

  expand(workflow: WorkflowDefinition): WorkflowDefinition {
    const existingByParentAndName = new Map<string, WorkflowNodeConnection>();
    for (const c of workflow.connections ?? []) {
      existingByParentAndName.set(`${c.parentNodeId}\0${c.connectionName}`, c);
    }

    const extraNodes: NodeDefinition[] = [];
    const extraConnections: WorkflowNodeConnection[] = [];

    for (const node of workflow.nodes) {
      if (node.type !== AIAgentNode || !AgentConfigInspector.isAgentNodeConfig(node.config)) {
        continue;
      }
      const agentId = node.id;
      const agentConfig = node.config;

      if (!existingByParentAndName.has(`${agentId}\0llm`)) {
        const llmId = ConnectionNodeIdFactory.languageModelConnectionNodeId(agentId);
        this.assertNoIdCollision(workflow, extraNodes, llmId);
        extraNodes.push({
          id: llmId,
          kind: "node",
          type: ConnectionCredentialNode,
          name: agentConfig.chatModel.presentation?.label ?? agentConfig.chatModel.name,
          config: this.connectionCredentialNodeConfigFactory.create(agentConfig.chatModel.name, agentConfig.chatModel),
        });
        extraConnections.push({ parentNodeId: agentId, connectionName: "llm", childNodeIds: [llmId] });
      }

      if (!existingByParentAndName.has(`${agentId}\0tools`) && (agentConfig.tools?.length ?? 0) > 0) {
        const toolIds: string[] = [];
        for (const tool of agentConfig.tools ?? []) {
          const toolId = ConnectionNodeIdFactory.toolConnectionNodeId(agentId, tool.name);
          this.assertNoIdCollision(workflow, extraNodes, toolId);
          toolIds.push(toolId);
          extraNodes.push({
            id: toolId,
            kind: "node",
            type: ConnectionCredentialNode,
            name: tool.presentation?.label ?? tool.name,
            config: this.connectionCredentialNodeConfigFactory.create(tool.name, tool),
          });
        }
        extraConnections.push({ parentNodeId: agentId, connectionName: "tools", childNodeIds: toolIds });
      }
    }

    if (extraNodes.length === 0) {
      return workflow;
    }

    return {
      ...workflow,
      nodes: [...workflow.nodes, ...extraNodes],
      connections: [...(workflow.connections ?? []), ...extraConnections],
    };
  }

  private assertNoIdCollision(workflow: WorkflowDefinition, pending: ReadonlyArray<NodeDefinition>, id: string): void {
    if (workflow.nodes.some((n) => n.id === id) || pending.some((n) => n.id === id)) {
      throw new Error(
        `AIAgent connection expansion: node id "${id}" already exists. Rename the conflicting node or adjust the workflow.`,
      );
    }
  }
}
