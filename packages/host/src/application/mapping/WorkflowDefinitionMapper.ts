import type { NodeDefinition, WorkflowActivationPolicy, WorkflowDefinition } from "@codemation/core";
import {
  AgentConfigInspector,
  AgentConnectionNodeCollector,
  CoreTokens,
  inject,
  injectable,
  type AgentConnectionNodeDescriptor,
} from "@codemation/core";
import type {
  WorkflowDto,
  WorkflowEdgeDto,
  WorkflowNodeDto,
  WorkflowSummary,
} from "../contracts/WorkflowViewContracts";
import type { DataMapper } from "./DataMapper";
import { WorkflowPolicyUiPresentationFactory } from "./WorkflowPolicyUiPresentationFactory";

@injectable()
export class WorkflowDefinitionMapper implements DataMapper<WorkflowDefinition, WorkflowDto> {
  constructor(
    @inject(WorkflowPolicyUiPresentationFactory)
    private readonly policyUi: WorkflowPolicyUiPresentationFactory,
    @inject(CoreTokens.WorkflowActivationPolicy)
    private readonly workflowActivationPolicy: WorkflowActivationPolicy,
  ) {}

  async map(workflow: WorkflowDefinition): Promise<WorkflowDto> {
    return this.mapSync(workflow);
  }

  mapSync(workflow: WorkflowDefinition): WorkflowDto {
    const mapped = this.mapNodesAndEdges(workflow);
    return {
      id: workflow.id,
      name: workflow.name,
      active: this.workflowActivationPolicy.isActive(workflow.id),
      hasWorkflowErrorHandler: this.policyUi.workflowHasErrorHandler(workflow),
      nodes: mapped.nodes,
      edges: mapped.edges,
    };
  }

  toSummary(workflow: WorkflowDefinition): WorkflowSummary {
    return {
      id: workflow.id,
      name: workflow.name,
      active: this.workflowActivationPolicy.isActive(workflow.id),
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

  private mapNodesAndEdges(
    workflow: WorkflowDefinition,
  ): Readonly<{ nodes: ReadonlyArray<WorkflowNodeDto>; edges: WorkflowDto["edges"] }> {
    const connectionChildMeta = this.buildConnectionChildMeta(workflow);
    const materializedConnectionNodeIds = new Set(connectionChildMeta.keys());
    const nodesById = new Map(workflow.nodes.map((node) => [node.id, node] as const));
    const agentConnectionDescriptors = this.buildAgentConnectionDescriptorIndex(workflow);
    return {
      nodes: this.toNodes({
        workflow,
        connectionChildMeta,
        materializedConnectionNodeIds,
        nodesById,
        agentConnectionDescriptors,
      }),
      edges: this.toEdges({
        workflow,
        materializedConnectionNodeIds,
        agentConnectionDescriptors,
      }),
    };
  }

  private toNodes(
    args: Readonly<{
      workflow: WorkflowDefinition;
      connectionChildMeta: ReadonlyMap<string, Readonly<{ parentNodeId: string; connectionName: string }>>;
      materializedConnectionNodeIds: ReadonlySet<string>;
      nodesById: ReadonlyMap<string, WorkflowDefinition["nodes"][number]>;
      agentConnectionDescriptors: Readonly<{
        byAgentNodeId: ReadonlyMap<string, ReadonlyArray<AgentConnectionNodeDescriptor>>;
        byChildNodeIdByAgentNodeId: ReadonlyMap<string, ReadonlyMap<string, AgentConnectionNodeDescriptor>>;
      }>;
    }>,
  ): ReadonlyArray<WorkflowNodeDto> {
    const workflow = args.workflow;
    const connectionChildMeta = args.connectionChildMeta;
    const materializedConnectionNodeIds = args.materializedConnectionNodeIds;
    const nodesById = args.nodesById;
    const agentConnectionDescriptors = args.agentConnectionDescriptors;
    const nodes: WorkflowNodeDto[] = [];
    for (const node of workflow.nodes) {
      const conn = connectionChildMeta.get(node.id);
      if (conn) {
        const parentNode = nodesById.get(conn.parentNodeId);
        let role: string = conn.connectionName === "llm" ? "languageModel" : "tool";
        if (parentNode && AgentConfigInspector.isAgentNodeConfig(parentNode.config)) {
          const descriptor = agentConnectionDescriptors.byChildNodeIdByAgentNodeId.get(conn.parentNodeId)?.get(node.id);
          if (descriptor) {
            role = descriptor.role;
          }
        }
        nodes.push({
          id: node.id,
          kind: node.kind,
          name: node.name ?? node.config?.name,
          type: this.nodeTypeName(node),
          role,
          icon: node.config?.icon,
          retryPolicySummary: this.policyUi.nodeRetrySummary(node.config),
          hasNodeErrorHandler: this.policyUi.nodeHasErrorHandler(node.config),
          ...this.nodePortFieldsFromConfig(node.config),
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
        ...this.nodePortFieldsFromConfig(node.config),
      });
      if (AgentConfigInspector.isAgentNodeConfig(node.config)) {
        this.appendVirtualConnectionNodes(
          materializedConnectionNodeIds,
          nodes,
          agentConnectionDescriptors.byAgentNodeId.get(node.id) ?? [],
        );
      }
    }
    return nodes;
  }

  private toEdges(
    args: Readonly<{
      workflow: WorkflowDefinition;
      materializedConnectionNodeIds: ReadonlySet<string>;
      agentConnectionDescriptors: Readonly<{
        byAgentNodeId: ReadonlyMap<string, ReadonlyArray<AgentConnectionNodeDescriptor>>;
        byChildNodeIdByAgentNodeId: ReadonlyMap<string, ReadonlyMap<string, AgentConnectionNodeDescriptor>>;
      }>;
    }>,
  ): WorkflowDto["edges"] {
    const workflow = args.workflow;
    const materializedConnectionNodeIds = args.materializedConnectionNodeIds;
    const agentConnectionDescriptors = args.agentConnectionDescriptors;
    const edges: WorkflowEdgeDto[] = [...workflow.edges];
    const edgeKeys = new Set(edges.map((edge) => this.edgeKey(edge.from.nodeId, edge.to.nodeId, edge.to.input)));
    this.appendMaterializedConnectionEdges(workflow, edgeKeys, edges);
    for (const node of workflow.nodes) {
      if (!AgentConfigInspector.isAgentNodeConfig(node.config)) {
        continue;
      }
      this.appendVirtualConnectionEdges(
        materializedConnectionNodeIds,
        edgeKeys,
        edges,
        agentConnectionDescriptors.byAgentNodeId.get(node.id) ?? [],
      );
    }
    return edges;
  }

  private appendMaterializedConnectionEdges(
    workflow: WorkflowDefinition,
    edgeKeys: Set<string>,
    edges: WorkflowEdgeDto[],
  ): void {
    for (const connection of workflow.connections ?? []) {
      for (const childNodeId of connection.childNodeIds) {
        const key = this.edgeKey(connection.parentNodeId, childNodeId, "in");
        if (edgeKeys.has(key)) {
          continue;
        }
        edges.push({
          from: { nodeId: connection.parentNodeId, output: "main" },
          to: { nodeId: childNodeId, input: "in" },
        });
        edgeKeys.add(key);
      }
    }
  }

  private buildAgentConnectionDescriptorIndex(workflow: WorkflowDefinition): Readonly<{
    byAgentNodeId: ReadonlyMap<string, ReadonlyArray<AgentConnectionNodeDescriptor>>;
    byChildNodeIdByAgentNodeId: ReadonlyMap<string, ReadonlyMap<string, AgentConnectionNodeDescriptor>>;
  }> {
    const byAgentNodeId = new Map<string, ReadonlyArray<AgentConnectionNodeDescriptor>>();
    const byChildNodeIdByAgentNodeId = new Map<string, ReadonlyMap<string, AgentConnectionNodeDescriptor>>();
    for (const node of workflow.nodes) {
      if (!AgentConfigInspector.isAgentNodeConfig(node.config)) {
        continue;
      }
      const descriptors = AgentConnectionNodeCollector.collect(node.id, node.config);
      byAgentNodeId.set(node.id, descriptors);
      const byChildId = new Map<string, AgentConnectionNodeDescriptor>();
      for (const descriptor of descriptors) {
        byChildId.set(descriptor.nodeId, descriptor);
      }
      byChildNodeIdByAgentNodeId.set(node.id, byChildId);
    }
    return { byAgentNodeId, byChildNodeIdByAgentNodeId };
  }

  private appendVirtualConnectionNodes(
    materializedConnectionNodeIds: ReadonlySet<string>,
    nodes: WorkflowNodeDto[],
    descriptors: ReadonlyArray<AgentConnectionNodeDescriptor>,
  ): void {
    for (const connectionNode of descriptors) {
      if (materializedConnectionNodeIds.has(connectionNode.nodeId)) {
        continue;
      }
      nodes.push(this.createConnectionNode(connectionNode));
    }
  }

  private appendVirtualConnectionEdges(
    materializedConnectionNodeIds: ReadonlySet<string>,
    edgeKeys: Set<string>,
    edges: WorkflowEdgeDto[],
    descriptors: ReadonlyArray<AgentConnectionNodeDescriptor>,
  ): void {
    for (const connectionNode of descriptors) {
      if (materializedConnectionNodeIds.has(connectionNode.nodeId)) {
        continue;
      }
      const key = this.edgeKey(connectionNode.parentNodeId, connectionNode.nodeId, "in");
      if (edgeKeys.has(key)) {
        continue;
      }
      edges.push({
        from: { nodeId: connectionNode.parentNodeId, output: "main" },
        to: { nodeId: connectionNode.nodeId, input: "in" },
      });
      edgeKeys.add(key);
    }
  }

  private edgeKey(fromNodeId: string, toNodeId: string, toInput: string): string {
    return `${fromNodeId}\0${toNodeId}\0${toInput}`;
  }

  private createConnectionNode(connectionNode: AgentConnectionNodeDescriptor): WorkflowNodeDto {
    return {
      id: connectionNode.nodeId,
      kind: "node",
      name: connectionNode.name,
      type: connectionNode.typeName,
      role: connectionNode.role,
      icon: connectionNode.icon,
      parentNodeId: connectionNode.parentNodeId,
    };
  }

  /**
   * Omit optional port fields when undefined so persisted snapshot DTOs (which never serialize
   * undefined keys) stay aligned with live workflow mapping.
   */
  private nodePortFieldsFromConfig(
    config: NodeDefinition["config"] | undefined,
  ): Pick<WorkflowNodeDto, "continueWhenEmptyOutput" | "declaredOutputPorts" | "declaredInputPorts"> {
    if (!config || typeof config !== "object") {
      return {};
    }
    const c = config as {
      continueWhenEmptyOutput?: boolean;
      declaredOutputPorts?: readonly string[];
      declaredInputPorts?: readonly string[];
    };
    return {
      ...(c.continueWhenEmptyOutput !== undefined && { continueWhenEmptyOutput: c.continueWhenEmptyOutput }),
      ...(c.declaredOutputPorts !== undefined && { declaredOutputPorts: c.declaredOutputPorts }),
      ...(c.declaredInputPorts !== undefined && { declaredInputPorts: c.declaredInputPorts }),
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
