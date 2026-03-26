import { ConnectionNodeIdFactory } from "@codemation/core/browser";
import { WorkflowPolicyUiPresentationFactory } from "@codemation/host-src/application/mapping/WorkflowPolicyUiPresentationFactory";
import type { PersistedWorkflowSnapshot, WorkflowDto } from "../../hooks/realtime/realtime";
import type { WorkflowNodeDto } from "../realtime/workflowTypes";

export class PersistedWorkflowSnapshotMapper {
  constructor(private readonly policyUi = new WorkflowPolicyUiPresentationFactory()) {}

  map(snapshot: PersistedWorkflowSnapshot): WorkflowDto {
    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const connectionChildMeta = this.buildConnectionChildMeta(snapshot);
    const nodes: WorkflowNodeDto[] = [];
    for (const node of snapshot.nodes) {
      if (connectionChildMeta.has(node.id)) {
        nodes.push(this.toConnectionChildDto(node, connectionChildMeta.get(node.id)!));
        continue;
      }
      nodes.push(...this.toTopLevelNodes(node, snapshot, nodesById));
    }
    return {
      id: snapshot.id,
      name: snapshot.name,
      active: false,
      hasWorkflowErrorHandler: snapshot.workflowErrorHandlerConfigured,
      nodes,
      edges: [...snapshot.edges, ...this.toAttachmentEdges(nodes)],
    };
  }

  private buildConnectionChildMeta(
    snapshot: PersistedWorkflowSnapshot,
  ): ReadonlyMap<string, Readonly<{ parentNodeId: string; connectionName: string }>> {
    const map = new Map<string, Readonly<{ parentNodeId: string; connectionName: string }>>();
    for (const c of snapshot.connections ?? []) {
      for (const childId of c.childNodeIds) {
        map.set(childId, { parentNodeId: c.parentNodeId, connectionName: c.connectionName });
      }
    }
    return map;
  }

  private agentHasConnectionChildren(snapshot: PersistedWorkflowSnapshot, agentNodeId: string): boolean {
    return (snapshot.connections ?? []).some((c) => c.parentNodeId === agentNodeId && c.childNodeIds.length > 0);
  }

  private allConnectionChildrenMaterialized(
    snapshot: PersistedWorkflowSnapshot,
    agentNodeId: string,
    nodesById: ReadonlyMap<string, PersistedWorkflowSnapshot["nodes"][number]>,
  ): boolean {
    const groups = (snapshot.connections ?? []).filter((c) => c.parentNodeId === agentNodeId);
    if (groups.length === 0) {
      return false;
    }
    for (const c of groups) {
      for (const childId of c.childNodeIds) {
        if (!nodesById.has(childId)) {
          return false;
        }
      }
    }
    return true;
  }

  private toTopLevelNodes(
    node: PersistedWorkflowSnapshot["nodes"][number],
    snapshot: PersistedWorkflowSnapshot,
    nodesById: ReadonlyMap<string, PersistedWorkflowSnapshot["nodes"][number]>,
  ): ReadonlyArray<WorkflowNodeDto> {
    const workflowNode: WorkflowNodeDto = {
      id: node.id,
      kind: node.kind,
      name: node.name,
      type: node.configTokenName ?? node.tokenName ?? node.configTokenId,
      role: this.isAgentConfig(node.config) ? "agent" : "workflowNode",
      icon: this.readNodeIcon(node.config),
      retryPolicySummary: this.policyUi.snapshotNodeRetrySummary(node.config),
      hasNodeErrorHandler: this.policyUi.snapshotNodeHasErrorHandler(node.config),
    };

    if (!this.isAgentConfig(node.config)) {
      return [workflowNode];
    }

    if (this.allConnectionChildrenMaterialized(snapshot, node.id, nodesById)) {
      return [workflowNode];
    }

    if (this.agentHasConnectionChildren(snapshot, node.id)) {
      return [workflowNode, ...this.toAttachmentNodes(node)];
    }

    return [workflowNode, ...this.toAttachmentNodes(node)];
  }

  private toConnectionChildDto(
    node: PersistedWorkflowSnapshot["nodes"][number],
    meta: Readonly<{ parentNodeId: string; connectionName: string }>,
  ): WorkflowNodeDto {
    const role = meta.connectionName === "llm" ? "languageModel" : "tool";
    return {
      id: node.id,
      kind: node.kind,
      name: node.name,
      type: node.configTokenName ?? node.tokenName ?? node.configTokenId,
      role,
      icon: this.readNodeIcon(node.config),
      retryPolicySummary: this.policyUi.snapshotNodeRetrySummary(node.config),
      hasNodeErrorHandler: this.policyUi.snapshotNodeHasErrorHandler(node.config),
      parentNodeId: meta.parentNodeId,
    };
  }

  private toAttachmentNodes(node: PersistedWorkflowSnapshot["nodes"][number]): ReadonlyArray<WorkflowNodeDto> {
    const config = this.asRecord(node.config);
    const chatModel = this.asRecord(config.chatModel);
    const languageModelNode = chatModel.name
      ? [
          {
            id: ConnectionNodeIdFactory.languageModelConnectionNodeId(node.id),
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
              id: ConnectionNodeIdFactory.toolConnectionNodeId(node.id, String(toolConfig.name)),
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

  private readNodeIcon(config: unknown): string | undefined {
    const c = this.asRecord(config);
    return typeof c.icon === "string" ? c.icon : undefined;
  }

  private asRecord(value: unknown): Readonly<{
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
