import type { WorkflowDefinition, WorkflowNodeInstanceFactory } from "../types";
import { WorkflowExecutableNodeClassifierFactory } from "../workflow/definition/WorkflowExecutableNodeClassifierFactory";

import { RunQueuePlanner } from "./RunQueuePlanner";
import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export class EngineWorkflowPlanningFactory {
  constructor(private readonly workflowNodeInstanceFactory: WorkflowNodeInstanceFactory) {}

  create(workflow: WorkflowDefinition): Readonly<{ topology: WorkflowTopology; planner: RunQueuePlanner }> {
    this.validateAcyclic(workflow);
    const topology = WorkflowTopology.fromWorkflow(workflow);
    const nodeInstances = this.workflowNodeInstanceFactory.createNodes(workflow);
    const planner = new RunQueuePlanner(topology, nodeInstances);
    planner.validateNodeKinds();
    return { topology, planner };
  }

  private validateAcyclic(workflow: WorkflowDefinition): void {
    const classifier = WorkflowExecutableNodeClassifierFactory.create(workflow);
    const outgoing = new Map<string, string[]>();
    const visitState = new Map<string, "unvisited" | "visiting" | "done">();

    for (const node of workflow.nodes) {
      if (classifier.isExecutableNodeId(node.id)) {
        visitState.set(node.id, "unvisited");
      }
    }

    for (const edge of workflow.edges) {
      if (!classifier.isExecutableNodeId(edge.from.nodeId) || !classifier.isExecutableNodeId(edge.to.nodeId)) {
        continue;
      }
      const destinations = outgoing.get(edge.from.nodeId) ?? [];
      destinations.push(edge.to.nodeId);
      outgoing.set(edge.from.nodeId, destinations);
    }

    for (const node of workflow.nodes) {
      if (classifier.isExecutableNodeId(node.id) && visitState.get(node.id) === "unvisited") {
        this.depthFirstSearch(node.id, outgoing, visitState);
      }
    }
  }

  private depthFirstSearch(
    nodeId: string,
    outgoing: ReadonlyMap<string, ReadonlyArray<string>>,
    visitState: Map<string, "unvisited" | "visiting" | "done">,
  ): void {
    visitState.set(nodeId, "visiting");
    for (const toNodeId of outgoing.get(nodeId) ?? []) {
      const state = visitState.get(toNodeId);
      if (state === "visiting") {
        throw new Error(`Workflow graph contains a directed cycle (edge ${nodeId} -> ${toNodeId}).`);
      }
      if (state === "unvisited") {
        this.depthFirstSearch(toNodeId, outgoing, visitState);
      }
    }
    visitState.set(nodeId, "done");
  }
}
