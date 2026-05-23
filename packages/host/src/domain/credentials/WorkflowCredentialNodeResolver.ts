import type { CredentialRequirement, WorkflowDefinition } from "@codemation/core";
import {
  AgentConfigInspector,
  AgentConnectionNodeCollector,
  type AgentConnectionNodeDescriptor,
  ConnectionNodeIdFactory,
  inject,
  injectable,
  mcpSlotKey,
} from "@codemation/core";
import { McpServerCatalog } from "../../mcp/McpServerCatalog";

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
  constructor(
    @inject(McpServerCatalog)
    private readonly mcpCatalog?: McpServerCatalog,
  ) {}
  /**
   * Human-readable label for credential errors (workflow node name or agent › attachment).
   */
  describeCredentialNodeDisplay(workflow: WorkflowDefinition, nodeId: string): string {
    const direct = workflow.nodes.find((n) => n.id === nodeId);
    if (direct) {
      return direct.name ?? direct.config.name ?? direct.id;
    }
    const recursive = this.findRecursiveConnectionNode(workflow, nodeId);
    if (!recursive) {
      return nodeId;
    }
    return this.buildRecursiveDisplayLabel(recursive.rootAgentLabel, recursive.entry, recursive.entriesById);
  }

  isCredentialNodeIdInWorkflow(workflow: WorkflowDefinition, nodeId: string): boolean {
    if (workflow.nodes.some((n) => n.id === nodeId)) {
      return true;
    }
    return this.findRecursiveConnectionNode(workflow, nodeId) !== undefined;
  }

  findRequirement(
    workflow: WorkflowDefinition,
    nodeId: string,
    slotKey: string,
  ): Readonly<{ nodeName: string; requirement: CredentialRequirement }> | undefined {
    const agentMcp = this.findAgentMcpRequirement(workflow, nodeId, slotKey);
    if (agentMcp) {
      return agentMcp;
    }
    const direct = this.findDirectRequirement(workflow, nodeId, slotKey);
    if (direct) {
      return direct;
    }
    const recursive = this.findRecursiveConnectionNode(workflow, nodeId);
    if (!recursive) {
      return undefined;
    }
    const requirement = recursive.entry.credentialSource
      .getCredentialRequirements?.()
      ?.find((entry) => entry.slotKey === slotKey);
    return requirement ? { nodeName: recursive.entry.name, requirement } : undefined;
  }

  listSlots(workflow: WorkflowDefinition): ReadonlyArray<WorkflowCredentialSlotRef> {
    const slotsByKey = new Map<string, WorkflowCredentialSlotRef>();

    for (const node of workflow.nodes) {
      if (AgentConfigInspector.isAgentNodeConfig(node.config)) {
        this.addRecursiveAgentSlots(workflow.id, node.id, node.config, slotsByKey);
        continue;
      }
      this.addSlotsForRequirements(
        workflow.id,
        node.id,
        node.name ?? node.config.name ?? node.id,
        node.config.getCredentialRequirements?.() ?? [],
        slotsByKey,
      );
    }
    return [...slotsByKey.values()];
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

  private addRecursiveAgentSlots(
    workflowId: string,
    rootAgentNodeId: string,
    agentConfig: Parameters<typeof AgentConnectionNodeCollector.collect>[1],
    slotsByKey: Map<string, WorkflowCredentialSlotRef>,
  ): void {
    const mcpResolver = this.mcpCatalog ? (id: string) => this.mcpCatalog!.get(id) : undefined;
    const descriptors = AgentConnectionNodeCollector.collect(rootAgentNodeId, agentConfig, mcpResolver);
    for (const entry of descriptors) {
      this.addSlotsForRequirements(
        workflowId,
        entry.nodeId,
        entry.name,
        entry.credentialSource.getCredentialRequirements?.() ?? [],
        slotsByKey,
      );
    }
    this.addAgentMcpSlotsFromConfig(workflowId, rootAgentNodeId, agentConfig, slotsByKey);
  }

  /**
   * MCP credential slots are owned by the agent node itself (one per declared server,
   * slot key `mcp:<serverId>`) so a single canvas-level binding flow drives both the
   * agent's runtime and the credential-health UI. Requirements are augmented with
   * `displayName` + `acceptedCredentialTypes` from the MCP catalog at slot-listing time.
   */
  private addAgentMcpSlotsFromConfig(
    workflowId: string,
    agentNodeId: string,
    agentConfig: Parameters<typeof AgentConnectionNodeCollector.collect>[1],
    slotsByKey: Map<string, WorkflowCredentialSlotRef>,
  ): void {
    if (!this.mcpCatalog) {
      return;
    }
    const mcpServers = (agentConfig as unknown as { mcpServers?: ReadonlyArray<string> }).mcpServers;
    if (!mcpServers || mcpServers.length === 0) {
      return;
    }
    const agentLabel = (agentConfig as { name?: string }).name ?? agentNodeId;
    for (const serverId of mcpServers) {
      const decl = this.mcpCatalog.get(serverId);
      if (!decl) {
        continue;
      }
      const requirement: CredentialRequirement = {
        slotKey: mcpSlotKey(serverId),
        label: decl.displayName,
        acceptedTypes: decl.acceptedCredentialTypes ?? [],
      };
      this.addSlotsForRequirements(workflowId, agentNodeId, agentLabel, [requirement], slotsByKey);
    }
  }

  private findAgentMcpRequirement(
    workflow: WorkflowDefinition,
    nodeId: string,
    slotKey: string,
  ): Readonly<{ nodeName: string; requirement: CredentialRequirement }> | undefined {
    if (!this.mcpCatalog) {
      return undefined;
    }
    if (!slotKey.startsWith("mcp:")) {
      return undefined;
    }
    const serverId = slotKey.slice("mcp:".length);
    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    if (!node || !AgentConfigInspector.isAgentNodeConfig(node.config)) {
      return undefined;
    }
    const mcpServers = (node.config as unknown as { mcpServers?: ReadonlyArray<string> }).mcpServers;
    if (!mcpServers?.includes(serverId)) {
      return undefined;
    }
    const decl = this.mcpCatalog.get(serverId);
    if (!decl) {
      return undefined;
    }
    const requirement: CredentialRequirement = {
      slotKey: mcpSlotKey(serverId),
      label: decl.displayName,
      acceptedTypes: decl.acceptedCredentialTypes ?? [],
    };
    return { nodeName: node.name ?? node.config.name ?? node.id, requirement };
  }

  private addSlotsForRequirements(
    workflowId: string,
    nodeId: string,
    nodeName: string,
    requirements: ReadonlyArray<CredentialRequirement>,
    slotsByKey: Map<string, WorkflowCredentialSlotRef>,
  ): void {
    for (const requirement of requirements) {
      const key = `${nodeId}\0${requirement.slotKey}`;
      if (slotsByKey.has(key)) {
        continue;
      }
      slotsByKey.set(key, {
        workflowId,
        nodeId,
        nodeName,
        requirement,
      });
    }
  }

  private findRecursiveConnectionNode(
    workflow: WorkflowDefinition,
    nodeId: string,
  ):
    | Readonly<{
        rootAgentNodeId: string;
        rootAgentLabel: string;
        entry: AgentConnectionNodeDescriptor;
        entriesById: ReadonlyMap<string, AgentConnectionNodeDescriptor>;
      }>
    | undefined {
    if (
      !ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(nodeId) &&
      !ConnectionNodeIdFactory.isToolConnectionNodeId(nodeId) &&
      !ConnectionNodeIdFactory.isMcpConnectionNodeId(nodeId)
    ) {
      return undefined;
    }
    const mcpResolver = this.mcpCatalog ? (id: string) => this.mcpCatalog!.get(id) : undefined;
    for (const node of workflow.nodes) {
      if (!AgentConfigInspector.isAgentNodeConfig(node.config)) {
        continue;
      }
      const entries = AgentConnectionNodeCollector.collect(node.id, node.config, mcpResolver);
      const entriesById = new Map(entries.map((entry) => [entry.nodeId, entry]));
      const entry = entriesById.get(nodeId);
      if (!entry) {
        continue;
      }
      return {
        rootAgentNodeId: node.id,
        rootAgentLabel: node.name ?? node.config.name ?? node.id,
        entry,
        entriesById,
      };
    }
    return undefined;
  }

  private buildRecursiveDisplayLabel(
    rootAgentLabel: string,
    entry: AgentConnectionNodeDescriptor,
    entriesById: ReadonlyMap<string, AgentConnectionNodeDescriptor>,
  ): string {
    const labels = [rootAgentLabel, ...this.collectAncestorToolLabels(entry.parentNodeId, entriesById)];
    labels.push(entry.role === "languageModel" ? "Language model" : entry.name);
    return labels.join(" › ");
  }

  private collectAncestorToolLabels(
    parentNodeId: string,
    entriesById: ReadonlyMap<string, AgentConnectionNodeDescriptor>,
  ): ReadonlyArray<string> {
    const labels: string[] = [];
    let currentNodeId = parentNodeId;
    while (true) {
      const parentEntry = entriesById.get(currentNodeId);
      if (!parentEntry) {
        return labels.reverse();
      }
      if (parentEntry.role === "tool" || parentEntry.role === "nestedAgent") {
        labels.push(parentEntry.name);
      }
      currentNodeId = parentEntry.parentNodeId;
    }
  }
}
