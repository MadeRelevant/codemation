import type { AgentNodeConfig, NodeDefinition, WorkflowActivationPolicy, WorkflowDefinition } from "@codemation/core";
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
    return {
      id: workflow.id,
      name: workflow.name,
      active: this.workflowActivationPolicy.isActive(workflow.id),
      hasWorkflowErrorHandler: this.policyUi.workflowHasErrorHandler(workflow),
      nodes: this.toNodes(workflow),
      edges: this.toEdges(workflow),
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

  private toNodes(workflow: WorkflowDefinition): ReadonlyArray<WorkflowNodeDto> {
    const connectionChildMeta = this.buildConnectionChildMeta(workflow);
    const materializedConnectionNodeIds = new Set(connectionChildMeta.keys());
    const nodes: WorkflowNodeDto[] = [];
    for (const node of workflow.nodes) {
      const conn = connectionChildMeta.get(node.id);
      if (conn) {
        const parentNode = workflow.nodes.find((n) => n.id === conn.parentNodeId);
        let role: string = conn.connectionName === "llm" ? "languageModel" : "tool";
        if (parentNode && AgentConfigInspector.isAgentNodeConfig(parentNode.config)) {
          const descriptor = AgentConnectionNodeCollector.collect(conn.parentNodeId, parentNode.config).find(
            (d) => d.nodeId === node.id,
          );
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
      if (AgentConfigInspector.isAgentNodeConfig(node.config)) {
        this.appendVirtualConnectionNodes(node.id, node.config, materializedConnectionNodeIds, nodes);
      }
    }
    return nodes;
  }

  private toEdges(workflow: WorkflowDefinition): WorkflowDto["edges"] {
    const connectionChildMeta = this.buildConnectionChildMeta(workflow);
    const materializedConnectionNodeIds = new Set(connectionChildMeta.keys());
    const edges: WorkflowEdgeDto[] = [...workflow.edges];
    const edgeKeys = new Set(edges.map((edge) => this.edgeKey(edge.from.nodeId, edge.to.nodeId, edge.to.input)));
    this.appendMaterializedConnectionEdges(workflow, edgeKeys, edges);
    for (const node of workflow.nodes) {
      if (!AgentConfigInspector.isAgentNodeConfig(node.config)) {
        continue;
      }
      this.appendVirtualConnectionEdges(node.id, node.config, materializedConnectionNodeIds, edgeKeys, edges);
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

  private appendVirtualConnectionNodes(
    rootAgentNodeId: string,
    agentConfig: AgentNodeConfig<any, any>,
    materializedConnectionNodeIds: ReadonlySet<string>,
    nodes: WorkflowNodeDto[],
  ): void {
    for (const connectionNode of AgentConnectionNodeCollector.collect(rootAgentNodeId, agentConfig)) {
      if (materializedConnectionNodeIds.has(connectionNode.nodeId)) {
        continue;
      }
      nodes.push(this.createConnectionNode(connectionNode));
    }
  }

  private appendVirtualConnectionEdges(
    rootAgentNodeId: string,
    agentConfig: AgentNodeConfig<any, any>,
    materializedConnectionNodeIds: ReadonlySet<string>,
    edgeKeys: Set<string>,
    edges: WorkflowEdgeDto[],
  ): void {
    for (const connectionNode of AgentConnectionNodeCollector.collect(rootAgentNodeId, agentConfig)) {
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
