import { AgentConnectionNodeCollector, ConnectionNodeIdFactory, type AgentNodeConfig } from "@codemation/core/browser";
import { WorkflowPolicyUiPresentationFactory } from "@codemation/host-src/application/mapping/WorkflowPolicyUiPresentationFactory";
import type { PersistedWorkflowSnapshot, WorkflowDto } from "../../hooks/realtime/realtime";
import type { WorkflowNodeDto } from "../realtime/workflowTypes";

export class PersistedWorkflowSnapshotMapper {
  constructor(private readonly policyUi = new WorkflowPolicyUiPresentationFactory()) {}

  map(snapshot: PersistedWorkflowSnapshot): WorkflowDto {
    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const connectionChildMeta = this.buildConnectionChildMeta(snapshot);
    const materializedConnectionNodeIds = new Set(connectionChildMeta.keys());
    const nodes: WorkflowNodeDto[] = [];
    for (const node of snapshot.nodes) {
      if (connectionChildMeta.has(node.id)) {
        nodes.push(this.toConnectionChildDto(node, connectionChildMeta.get(node.id)!, snapshot));
        continue;
      }
      nodes.push(...this.toTopLevelNodes(node, snapshot, nodesById, materializedConnectionNodeIds));
    }
    return {
      id: snapshot.id,
      name: snapshot.name,
      active: false,
      hasWorkflowErrorHandler: snapshot.workflowErrorHandlerConfigured,
      nodes,
      edges: this.mergeAttachmentEdges(snapshot.edges, nodes),
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
    materializedConnectionNodeIds: ReadonlySet<string>,
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
      return [workflowNode, ...this.toAttachmentNodes(node.id, node.config, materializedConnectionNodeIds)];
    }

    return [workflowNode, ...this.toAttachmentNodes(node.id, node.config, materializedConnectionNodeIds)];
  }

  private toConnectionChildDto(
    node: PersistedWorkflowSnapshot["nodes"][number],
    meta: Readonly<{ parentNodeId: string; connectionName: string }>,
    snapshot: PersistedWorkflowSnapshot,
  ): WorkflowNodeDto {
    const role = meta.connectionName === "llm" ? "languageModel" : this.resolveToolConnectionRole(node, snapshot);
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

  private toAttachmentNodes(
    parentNodeId: string,
    configValue: unknown,
    materializedConnectionNodeIds: ReadonlySet<string>,
  ): ReadonlyArray<WorkflowNodeDto> {
    const config = this.asRecord(configValue);
    const nodes: WorkflowNodeDto[] = [];
    const chatModel = this.asRecord(config.chatModel);
    if (chatModel.name) {
      const languageModelNodeId = ConnectionNodeIdFactory.languageModelConnectionNodeId(parentNodeId);
      if (!materializedConnectionNodeIds.has(languageModelNodeId)) {
        nodes.push({
          id: languageModelNodeId,
          kind: "node",
          name: this.readAttachmentLabel(chatModel.presentation, chatModel.name),
          type: chatModel.name,
          role: "languageModel",
          icon: this.readAttachmentIcon(chatModel.presentation),
          parentNodeId,
        });
      }
    }
    const tools = Array.isArray(config.tools) ? config.tools : [];
    for (const tool of tools) {
      const toolConfig = this.asRecord(tool);
      if (!toolConfig.name) {
        continue;
      }
      const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId(parentNodeId, String(toolConfig.name));
      if (!materializedConnectionNodeIds.has(toolNodeId)) {
        nodes.push({
          id: toolNodeId,
          kind: "node",
          name: this.readAttachmentLabel(toolConfig.presentation, toolConfig.name),
          type: toolConfig.name,
          role: this.isAgentConfig(toolConfig.node) ? "nestedAgent" : "tool",
          icon: this.readAttachmentIcon(toolConfig.presentation),
          parentNodeId,
        });
      }
      if (this.isAgentConfig(toolConfig.node)) {
        nodes.push(...this.toAttachmentNodes(toolNodeId, toolConfig.node, materializedConnectionNodeIds));
      }
    }
    return nodes;
  }

  private mergeAttachmentEdges(
    baseEdges: WorkflowDto["edges"],
    nodes: ReadonlyArray<WorkflowNodeDto>,
  ): WorkflowDto["edges"] {
    const edges = [...baseEdges];
    const edgeKeys = new Set(edges.map((edge) => this.edgeKey(edge.from.nodeId, edge.to.nodeId, edge.to.input)));
    for (const node of nodes) {
      if (!node.parentNodeId) {
        continue;
      }
      const key = this.edgeKey(node.parentNodeId, node.id, "in");
      if (edgeKeys.has(key)) {
        continue;
      }
      edges.push({
        from: { nodeId: node.parentNodeId, output: "main" },
        to: { nodeId: node.id, input: "in" },
      });
      edgeKeys.add(key);
    }
    return edges;
  }

  private edgeKey(fromNodeId: string, toNodeId: string, toInput: string): string {
    return `${fromNodeId}\0${toNodeId}\0${toInput}`;
  }

  private isAgentConfig(value: unknown): boolean {
    const record = this.asRecord(value);
    return record.chatModel !== undefined && record.messages !== undefined;
  }

  /** Materialized tool-slot nodes may store the inner agent at top level or under `node` (node-backed tool). */
  private isNestedAgentToolSnapshotNode(node: PersistedWorkflowSnapshot["nodes"][number]): boolean {
    if (this.isAgentConfig(node.config)) {
      return true;
    }
    return this.isAgentConfig(this.asRecord(node.config).node);
  }

  /**
   * Resolves roles for materialized connection nodes (including expanded `ConnectionCredentialNode` children)
   * by scanning each top-level agent config — nested attachment ids are only discoverable from the root agent.
   */
  private resolveToolConnectionRole(
    node: PersistedWorkflowSnapshot["nodes"][number],
    snapshot: PersistedWorkflowSnapshot,
  ): string {
    const connectionChildIds = new Set<string>();
    for (const c of snapshot.connections ?? []) {
      for (const childId of c.childNodeIds) {
        connectionChildIds.add(childId);
      }
    }
    for (const top of snapshot.nodes) {
      if (connectionChildIds.has(top.id)) {
        continue;
      }
      if (!this.isAgentConfig(top.config)) {
        continue;
      }
      const descriptors = AgentConnectionNodeCollector.collect(top.id, top.config as AgentNodeConfig<any, any>);
      const found = descriptors.find((d) => d.nodeId === node.id);
      if (found) {
        return found.role;
      }
    }
    return this.isNestedAgentToolSnapshotNode(node) ? "nestedAgent" : "tool";
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
    chatModel?: unknown;
    node?: unknown;
    tools?: ReadonlyArray<unknown>;
    messages?: unknown;
    presentation?: unknown;
  }> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Readonly<{
      name?: string;
      label?: string;
      icon?: string;
      chatModel?: unknown;
      node?: unknown;
      tools?: ReadonlyArray<unknown>;
      messages?: unknown;
      presentation?: unknown;
    }>;
  }
}
