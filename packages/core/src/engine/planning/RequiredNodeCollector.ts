import type {
NodeId,
RunStopCondition
} from "../../types";


import { DependencySatisfactionResolver } from "./DependencySatisfactionResolver";
import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export class RequiredNodeCollector {
  private readonly requiredNodeIds = new Set<NodeId>();

  constructor(
    private readonly topology: WorkflowTopology,
    private readonly satisfactionResolver: DependencySatisfactionResolver,
  ) {}

  collect(stopCondition: RunStopCondition): ReadonlySet<NodeId> {
    if (stopCondition.kind === "workflowCompleted") {
      for (const nodeId of this.topology.defsById.keys()) {
        if (!this.satisfactionResolver.isNodeSatisfied(nodeId)) {
          this.collectNode(nodeId);
        }
      }
      return this.requiredNodeIds;
    }

    if (!this.topology.defsById.has(stopCondition.nodeId)) {
      throw new Error(`Unknown stop nodeId: ${stopCondition.nodeId}`);
    }
    this.collectNode(stopCondition.nodeId);
    return this.requiredNodeIds;
  }

  private collectNode(nodeId: NodeId): void {
    if (this.requiredNodeIds.has(nodeId)) {
      return;
    }
    if (this.satisfactionResolver.isNodeSatisfied(nodeId) && !this.satisfactionResolver.isNodeSatisfiedByOutputsOnly(nodeId)) {
      return;
    }
    this.requiredNodeIds.add(nodeId);
    for (const edge of this.topology.incomingByNode.get(nodeId) ?? []) {
      if (
        !this.satisfactionResolver.isEdgeSatisfied({ nodeId, input: edge.input }) ||
        this.satisfactionResolver.isNodeSatisfiedByOutputsOnly(edge.from.nodeId)
      ) {
        this.collectNode(edge.from.nodeId);
      }
    }
  }
}
