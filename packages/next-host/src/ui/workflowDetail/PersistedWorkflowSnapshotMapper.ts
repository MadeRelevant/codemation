import { AgentAttachmentNodeIdFactory } from "@codemation/core/browser";
import type { PersistedWorkflowSnapshot,WorkflowDto } from "../realtime/realtime";
import type { WorkflowNodeDto } from "../realtime/workflowTypes";

export class PersistedWorkflowSnapshotMapper {
  map(snapshot: PersistedWorkflowSnapshot): WorkflowDto {
    const nodes = snapshot.nodes.flatMap((node) => this.toWorkflowNodes(node));
    return {
      id: snapshot.id,
      name: snapshot.name,
      nodes,
      edges: [...snapshot.edges, ...this.toAttachmentEdges(nodes)],
    };
  }

  private toWorkflowNodes(node: PersistedWorkflowSnapshot["nodes"][number]): ReadonlyArray<WorkflowNodeDto> {
    const workflowNode: WorkflowNodeDto = {
      id: node.id,
      kind: node.kind,
      name: node.name,
      type: node.configTokenName ?? node.tokenName ?? node.configTokenId,
      role: this.isAgentConfig(node.config) ? "agent" : "workflowNode",
    };
    return [workflowNode, ...this.toAttachmentNodes(node)];
  }

  private toAttachmentNodes(node: PersistedWorkflowSnapshot["nodes"][number]): ReadonlyArray<WorkflowNodeDto> {
    const config = this.asRecord(node.config);
    const chatModel = this.asRecord(config.chatModel);
    const languageModelNode = chatModel.name
      ? [
          {
            id: AgentAttachmentNodeIdFactory.createLanguageModelNodeId(node.id),
            kind: "node",
            name: this.readAttachmentLabel(chatModel.presentation, chatModel.name),
            type: chatModel.name,
            role: "languageModel",
            icon: this.readAttachmentIcon(chatModel.presentation),
            parentNodeId: node.id,
          } satisfies WorkflowNodeDto,
        ]
      : [];
    const tools = Array.isArray(config.tools) ? config.tools : [];
    const toolNodes = tools.flatMap((tool) => {
      const toolConfig = this.asRecord(tool);
      return toolConfig.name
        ? [
            {
              id: AgentAttachmentNodeIdFactory.createToolNodeId(node.id, toolConfig.name),
              kind: "node",
              name: this.readAttachmentLabel(toolConfig.presentation, toolConfig.name),
              type: toolConfig.name,
              role: "tool",
              icon: this.readAttachmentIcon(toolConfig.presentation),
              parentNodeId: node.id,
            } satisfies WorkflowNodeDto,
          ]
        : [];
    });
    return [...languageModelNode, ...toolNodes];
  }

  private toAttachmentEdges(nodes: ReadonlyArray<WorkflowNodeDto>): WorkflowDto["edges"] {
    return nodes.flatMap((node) => {
      if (!node.parentNodeId) {
        return [];
      }
      return [
        {
          from: { nodeId: node.parentNodeId, output: "main" },
          to: { nodeId: node.id, input: "in" },
        },
      ];
    });
  }

  private isAgentConfig(value: unknown): boolean {
    const record = this.asRecord(value);
    return typeof record.systemMessage === "string" && record.chatModel !== undefined;
  }

  private readAttachmentLabel(presentation: unknown, fallback: string): string {
    const presentationRecord = this.asRecord(presentation);
    return presentationRecord.label ?? fallback;
  }

  private readAttachmentIcon(presentation: unknown): string | undefined {
    return this.asRecord(presentation).icon;
  }

  private asRecord(
    value: unknown,
  ): Readonly<{
    name?: string;
    label?: string;
    icon?: string;
    systemMessage?: string;
    chatModel?: unknown;
    tools?: ReadonlyArray<unknown>;
    presentation?: unknown;
  }> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Readonly<{
      name?: string;
      label?: string;
      icon?: string;
      systemMessage?: string;
      chatModel?: unknown;
      tools?: ReadonlyArray<unknown>;
      presentation?: unknown;
    }>;
  }
}
