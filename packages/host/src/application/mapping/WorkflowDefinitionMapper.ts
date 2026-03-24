import type { ChatModelConfig, NodeDefinition, ToolConfig, WorkflowDefinition } from "@codemation/core";
import { AgentConfigInspector, ConnectionNodeIdFactory } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import type { WorkflowDto, WorkflowNodeDto, WorkflowSummary } from "../contracts/WorkflowViewContracts";
import type { DataMapper } from "./DataMapper";
import { WorkflowPolicyUiPresentationFactory } from "./WorkflowPolicyUiPresentationFactory";

@injectable()
export class WorkflowDefinitionMapper implements DataMapper<WorkflowDefinition, WorkflowDto> {
  constructor(
    @inject(WorkflowPolicyUiPresentationFactory)
    private readonly policyUi: WorkflowPolicyUiPresentationFactory,
  ) {}

  async map(workflow: WorkflowDefinition): Promise<WorkflowDto> {
    return this.mapSync(workflow);
  }

  mapSync(workflow: WorkflowDefinition): WorkflowDto {
    return {
      id: workflow.id,
      name: workflow.name,
      hasWorkflowErrorHandler: this.policyUi.workflowHasErrorHandler(workflow),
      nodes: this.toNodes(workflow),
      edges: this.toEdges(workflow),
    };
  }

  toSummary(workflow: WorkflowDefinition): WorkflowSummary {
    return {
      id: workflow.id,
      name: workflow.name,
      discoveryPathSegments: workflow.discoveryPathSegments ?? [],
    };
  }

  private buildConnectionChildMeta(
    workflow: WorkflowDefinition,
  ): ReadonlyMap<string, Readonly<{ parentNodeId: string; connectionName: string }>> {
    const map = new Map<string, Readonly<{ parentNodeId: string; connectionName: string }>>();
    for (const c of workflow.connections ?? []) {
      for (const childId of c.childNodeIds) {
        map.set(childId, { parentNodeId: c.parentNodeId, connectionName: c.connectionName });
      }
    }
    return map;
  }

  private agentHasConnectionMetadata(workflow: WorkflowDefinition, agentNodeId: string): boolean {
    return (workflow.connections ?? []).some((c) => c.parentNodeId === agentNodeId);
  }

  private toNodes(workflow: WorkflowDefinition): ReadonlyArray<WorkflowNodeDto> {
    const connectionChildMeta = this.buildConnectionChildMeta(workflow);
    const nodes: WorkflowNodeDto[] = [];
    for (const node of workflow.nodes) {
      const conn = connectionChildMeta.get(node.id);
      if (conn) {
        const role = conn.connectionName === "llm" ? "languageModel" : "tool";
        nodes.push({
          id: node.id,
          kind: node.kind,
          name: node.name ?? node.config?.name,
          type: this.nodeTypeName(node),
          role,
          icon: node.config?.icon,
          retryPolicySummary: this.policyUi.nodeRetrySummary(node.config),
          hasNodeErrorHandler: this.policyUi.nodeHasErrorHandler(node.config),
          parentNodeId: conn.parentNodeId,
        });
        continue;
      }
      nodes.push({
        id: node.id,
        kind: node.kind,
        name: node.name ?? node.config?.name,
        type: this.nodeTypeName(node),
        role: AgentConfigInspector.isAgentNodeConfig(node.config) ? "agent" : "workflowNode",
        icon: node.config?.icon,
        retryPolicySummary: this.policyUi.nodeRetrySummary(node.config),
        hasNodeErrorHandler: this.policyUi.nodeHasErrorHandler(node.config),
      });
      if (AgentConfigInspector.isAgentNodeConfig(node.config) && !this.agentHasConnectionMetadata(workflow, node.id)) {
        nodes.push(this.createLanguageModelNode(node, node.config.chatModel));
        for (const toolConfig of node.config.tools ?? []) {
          nodes.push(this.createToolNode(node, toolConfig));
        }
      }
    }
    return nodes;
  }

  private toEdges(workflow: WorkflowDefinition): WorkflowDto["edges"] {
    const edges = [...workflow.edges];
    for (const node of workflow.nodes) {
      if (!AgentConfigInspector.isAgentNodeConfig(node.config)) {
        continue;
      }
      if (this.agentHasConnectionMetadata(workflow, node.id)) {
        for (const c of workflow.connections ?? []) {
          if (c.parentNodeId !== node.id) {
            continue;
          }
          for (const childId of c.childNodeIds) {
            edges.push({
              from: { nodeId: node.id, output: "main" },
              to: { nodeId: childId, input: "in" },
            });
          }
        }
        continue;
      }
      edges.push({
        from: { nodeId: node.id, output: "main" },
        to: { nodeId: ConnectionNodeIdFactory.languageModelConnectionNodeId(node.id), input: "in" },
      });
      for (const toolConfig of node.config.tools ?? []) {
        edges.push({
          from: { nodeId: node.id, output: "main" },
          to: { nodeId: ConnectionNodeIdFactory.toolConnectionNodeId(node.id, toolConfig.name), input: "in" },
        });
      }
    }
    return edges;
  }

  private createLanguageModelNode(node: NodeDefinition, chatModel: ChatModelConfig): WorkflowNodeDto {
    return {
      id: ConnectionNodeIdFactory.languageModelConnectionNodeId(node.id),
      kind: "node",
      name: chatModel.presentation?.label ?? chatModel.name,
      type: chatModel.name,
      role: "languageModel",
      icon: chatModel.presentation?.icon,
      parentNodeId: node.id,
    };
  }

  private createToolNode(node: NodeDefinition, toolConfig: ToolConfig): WorkflowNodeDto {
    return {
      id: ConnectionNodeIdFactory.toolConnectionNodeId(node.id, toolConfig.name),
      kind: "node",
      name: toolConfig.presentation?.label ?? toolConfig.name,
      type: toolConfig.name,
      role: "tool",
      icon: toolConfig.presentation?.icon,
      parentNodeId: node.id,
    };
  }

  private nodeTypeName(node: NodeDefinition): string {
    const configToken = node.config?.type as Readonly<{ name?: unknown }> | undefined;
    if (typeof configToken?.name === "string" && configToken.name) {
      return configToken.name;
    }
    const nodeToken = node.type as Readonly<{ name?: unknown }> | undefined;
    if (typeof nodeToken?.name === "string" && nodeToken.name) {
      return nodeToken.name;
    }
    return "Node";
  }
}
