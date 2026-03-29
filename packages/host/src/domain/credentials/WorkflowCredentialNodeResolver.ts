import type { CredentialRequirement, WorkflowDefinition } from "@codemation/core";
import {
  AgentConfigInspector,
  ConnectionNodeIdFactory,
  WorkflowExecutableNodeClassifierFactory,
} from "@codemation/core";

import { injectable } from "@codemation/core";

export type WorkflowCredentialSlotRef = Readonly<{
  workflowId: string;
  nodeId: string;
  nodeName: string;
  requirement: CredentialRequirement;
}>;

/**
 * Resolves credential requirements for workflow node ids, including connection-owned LLM/tool children.
 */
@injectable()
export class WorkflowCredentialNodeResolver {
  /**
   * Human-readable label for credential errors (workflow node name or agent › attachment).
   */
  describeCredentialNodeDisplay(workflow: WorkflowDefinition, nodeId: string): string {
    const direct = workflow.nodes.find((n) => n.id === nodeId);
    if (direct) {
      return direct.name ?? direct.config.name ?? direct.id;
    }
    if (ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(nodeId)) {
      const parentId = this.parseParentForLanguageModelConnectionNodeId(nodeId);
      const parent = parentId ? workflow.nodes.find((n) => n.id === parentId) : undefined;
      const agentLabel = parent?.name ?? parentId ?? "Agent";
      return `${agentLabel} › Language model`;
    }
    if (ConnectionNodeIdFactory.isToolConnectionNodeId(nodeId)) {
      const parsed = this.parseToolConnectionNodeId(nodeId);
      if (!parsed) {
        return nodeId;
      }
      const parent = workflow.nodes.find((n) => n.id === parsed.parentNodeId);
      const agentLabel = parent?.name ?? parsed.parentNodeId;
      const toolConfig =
        parent && AgentConfigInspector.isAgentNodeConfig(parent.config)
          ? parent.config.tools?.find(
              (tool) => ConnectionNodeIdFactory.normalizeToolName(tool.name) === parsed.normalizedToolName,
            )
          : undefined;
      const toolLabel = toolConfig?.presentation?.label ?? toolConfig?.name ?? parsed.normalizedToolName;
      return `${agentLabel} › ${toolLabel}`;
    }
    return nodeId;
  }

  isCredentialNodeIdInWorkflow(workflow: WorkflowDefinition, nodeId: string): boolean {
    if (workflow.nodes.some((n) => n.id === nodeId)) {
      return true;
    }
    if (ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(nodeId)) {
      const parent = this.parseParentForLanguageModelConnectionNodeId(nodeId);
      if (parent && workflow.nodes.some((n) => n.id === parent)) {
        return true;
      }
    }
    if (ConnectionNodeIdFactory.isToolConnectionNodeId(nodeId)) {
      const parsed = this.parseToolConnectionNodeId(nodeId);
      if (parsed && workflow.nodes.some((n) => n.id === parsed.parentNodeId)) {
        return true;
      }
    }
    return false;
  }

  findRequirement(
    workflow: WorkflowDefinition,
    nodeId: string,
    slotKey: string,
  ): Readonly<{ nodeName: string; requirement: CredentialRequirement }> | undefined {
    const direct = this.findDirectRequirement(workflow, nodeId, slotKey);
    if (direct) {
      return direct;
    }
    if (ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(nodeId)) {
      const parent = this.parseParentForLanguageModelConnectionNodeId(nodeId);
      if (parent) {
        const fromConn = this.findLanguageModelRequirement(workflow, parent, slotKey);
        if (fromConn) {
          return fromConn;
        }
      }
    }
    if (ConnectionNodeIdFactory.isToolConnectionNodeId(nodeId)) {
      const parsed = this.parseToolConnectionNodeId(nodeId);
      if (parsed) {
        const fromConn = this.findToolRequirement(workflow, parsed.parentNodeId, parsed.normalizedToolName, slotKey);
        if (fromConn) {
          return fromConn;
        }
      }
    }
    return undefined;
  }

  listSlots(workflow: WorkflowDefinition): ReadonlyArray<WorkflowCredentialSlotRef> {
    const slots: WorkflowCredentialSlotRef[] = [];
    const classifier = WorkflowExecutableNodeClassifierFactory.create(workflow);
    const hasConnectionMetadata = (workflow.connections?.length ?? 0) > 0;

    for (const node of workflow.nodes) {
      if (classifier.isConnectionOwnedNodeId(node.id)) {
        for (const requirement of node.config.getCredentialRequirements?.() ?? []) {
          slots.push({
            workflowId: workflow.id,
            nodeId: node.id,
            nodeName: node.name ?? node.config.name ?? node.id,
            requirement,
          });
        }
        continue;
      }

      if (AgentConfigInspector.isAgentNodeConfig(node.config)) {
        if (!hasConnectionMetadata) {
          const lmNodeId = ConnectionNodeIdFactory.languageModelConnectionNodeId(node.id);
          const lmLabel = node.config.chatModel.presentation?.label ?? node.config.chatModel.name;
          for (const requirement of node.config.chatModel.getCredentialRequirements?.() ?? []) {
            slots.push({
              workflowId: workflow.id,
              nodeId: lmNodeId,
              nodeName: lmLabel,
              requirement,
            });
          }
          for (const toolConfig of node.config.tools ?? []) {
            const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId(node.id, toolConfig.name);
            const toolLabel = toolConfig.presentation?.label ?? toolConfig.name;
            for (const requirement of toolConfig.getCredentialRequirements?.() ?? []) {
              slots.push({
                workflowId: workflow.id,
                nodeId: toolNodeId,
                nodeName: toolLabel,
                requirement,
              });
            }
          }
        }
        continue;
      }

      for (const requirement of node.config.getCredentialRequirements?.() ?? []) {
        slots.push({
          workflowId: workflow.id,
          nodeId: node.id,
          nodeName: node.name ?? node.config.name ?? node.id,
          requirement,
        });
      }
    }
    return slots;
  }

  private findDirectRequirement(
    workflow: WorkflowDefinition,
    nodeId: string,
    slotKey: string,
  ): Readonly<{ nodeName: string; requirement: CredentialRequirement }> | undefined {
    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    if (!node || AgentConfigInspector.isAgentNodeConfig(node.config)) {
      return undefined;
    }
    const requirement = node.config.getCredentialRequirements?.()?.find((entry) => entry.slotKey === slotKey);
    if (!requirement) {
      return undefined;
    }
    return { nodeName: node.name ?? node.config.name ?? node.id, requirement };
  }

  private findLanguageModelRequirement(
    workflow: WorkflowDefinition,
    parentNodeId: string,
    slotKey: string,
  ): Readonly<{ nodeName: string; requirement: CredentialRequirement }> | undefined {
    const parent = workflow.nodes.find((entry) => entry.id === parentNodeId);
    if (!parent || !AgentConfigInspector.isAgentNodeConfig(parent.config)) {
      return undefined;
    }
    const requirement = parent.config.chatModel
      .getCredentialRequirements?.()
      ?.find((entry) => entry.slotKey === slotKey);
    if (!requirement) {
      return undefined;
    }
    const nodeName =
      parent.config.chatModel.presentation?.label ?? parent.config.chatModel.name ?? parent.name ?? parent.id;
    return { nodeName, requirement };
  }

  private findToolRequirement(
    workflow: WorkflowDefinition,
    parentNodeId: string,
    normalizedToolName: string,
    slotKey: string,
  ): Readonly<{ nodeName: string; requirement: CredentialRequirement }> | undefined {
    const parent = workflow.nodes.find((entry) => entry.id === parentNodeId);
    if (!parent || !AgentConfigInspector.isAgentNodeConfig(parent.config)) {
      return undefined;
    }
    const toolConfig = parent.config.tools?.find(
      (tool) => ConnectionNodeIdFactory.normalizeToolName(tool.name) === normalizedToolName,
    );
    if (!toolConfig) {
      return undefined;
    }
    const requirement = toolConfig.getCredentialRequirements?.()?.find((entry) => entry.slotKey === slotKey);
    if (!requirement) {
      return undefined;
    }
    const nodeName = toolConfig.presentation?.label ?? toolConfig.name ?? parent.name ?? parent.id;
    return { nodeName, requirement };
  }

  private parseParentForLanguageModelConnectionNodeId(nodeId: string): string | undefined {
    if (!ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(nodeId)) {
      return undefined;
    }
    const suffix = `${ConnectionNodeIdFactory.connectionSegment}llm`;
    return nodeId.slice(0, -suffix.length);
  }

  private parseToolConnectionNodeId(nodeId: string): { parentNodeId: string; normalizedToolName: string } | undefined {
    if (!ConnectionNodeIdFactory.isToolConnectionNodeId(nodeId)) {
      return undefined;
    }
    const marker = `${ConnectionNodeIdFactory.connectionSegment}tool${ConnectionNodeIdFactory.connectionSegment}`;
    const idx = nodeId.indexOf(marker);
    if (idx < 0) {
      return undefined;
    }
    const parentNodeId = nodeId.slice(0, idx);
    const normalizedToolName = nodeId.slice(idx + marker.length);
    if (!parentNodeId || !normalizedToolName) {
      return undefined;
    }
    return { parentNodeId, normalizedToolName };
  }
}
