import type { ChatModelConfig, NodeDefinition, ToolConfig, WorkflowDefinition } from "@codemation/core";
import { AgentAttachmentNodeIdFactory, AgentConfigInspector } from "@codemation/core";
import type { WorkflowDto, WorkflowNodeDto } from "../realtime/workflowTypes";

export class CodemationWorkflowDtoMapper {
  toSummary(workflow: WorkflowDefinition): Readonly<{ id: string; name: string }> {
    return { id: workflow.id, name: workflow.name };
  }

  toDetail(workflow: WorkflowDefinition): WorkflowDto {
    return {
      id: workflow.id,
      name: workflow.name,
      nodes: this.toNodes(workflow),
      edges: this.toEdges(workflow),
    };
  }

  private toNodes(workflow: WorkflowDefinition): ReadonlyArray<WorkflowNodeDto> {
    const nodes: WorkflowNodeDto[] = [];
    for (const node of workflow.nodes) {
      nodes.push({
        id: node.id,
        kind: node.kind,
        name: node.name ?? node.config?.name,
        type: this.nodeTypeName(node),
        role: AgentConfigInspector.isAgentNodeConfig(node.config) ? "agent" : "workflowNode",
        icon: node.config?.icon,
      });
      if (!AgentConfigInspector.isAgentNodeConfig(node.config)) continue;
      nodes.push(this.createLanguageModelNode(node, node.config.chatModel));
      for (const toolConfig of node.config.tools ?? []) nodes.push(this.createToolNode(node, toolConfig));
    }
    return nodes;
  }

  private toEdges(workflow: WorkflowDefinition): WorkflowDefinition["edges"] {
    const edges = [...workflow.edges];
    for (const node of workflow.nodes) {
      if (!AgentConfigInspector.isAgentNodeConfig(node.config)) continue;
      edges.push({
        from: { nodeId: node.id, output: "main" },
        to: { nodeId: AgentAttachmentNodeIdFactory.createLanguageModelNodeId(node.id), input: "in" },
      });
      for (const toolConfig of node.config.tools ?? []) {
        edges.push({
          from: { nodeId: node.id, output: "main" },
          to: { nodeId: AgentAttachmentNodeIdFactory.createToolNodeId(node.id, toolConfig.name), input: "in" },
        });
      }
    }
    return edges;
  }

  private createLanguageModelNode(
    node: NodeDefinition,
    chatModel: ChatModelConfig,
  ): WorkflowNodeDto {
    return {
      id: AgentAttachmentNodeIdFactory.createLanguageModelNodeId(node.id),
      kind: "node",
      name: chatModel.presentation?.label ?? chatModel.name,
      type: chatModel.name,
      role: "languageModel",
      icon: chatModel.presentation?.icon,
      parentNodeId: node.id,
    };
  }

  private createToolNode(
    node: NodeDefinition,
    toolConfig: ToolConfig,
  ): WorkflowNodeDto {
    return {
      id: AgentAttachmentNodeIdFactory.createToolNodeId(node.id, toolConfig.name),
      kind: "node",
      name: toolConfig.presentation?.label ?? toolConfig.name,
      type: toolConfig.name,
      role: "tool",
      icon: toolConfig.presentation?.icon,
      parentNodeId: node.id,
    };
  }

  private nodeTypeName(node: NodeDefinition): string {
    const configToken = node.config?.type as unknown as Readonly<{ name?: unknown }> | undefined;
    if (typeof configToken?.name === "string" && configToken.name) return configToken.name;
    const nodeToken = node.type as unknown as Readonly<{ name?: unknown }> | undefined;
    if (typeof nodeToken?.name === "string" && nodeToken.name) return nodeToken.name;
    return "Node";
  }
}
