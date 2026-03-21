import type { InputPortKey, Items, NodeId, OutputPortKey, RunCurrentState } from "../../../types";

import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export class DependencySatisfactionResolver {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly currentState: RunCurrentState,
  ) {}

  isNodeSatisfied(nodeId: NodeId): boolean {
    return this.hasOutputs(nodeId) || this.hasCompletedSnapshot(nodeId);
  }

  isNodeSatisfiedByOutputsOnly(nodeId: NodeId): boolean {
    return this.hasOutputs(nodeId) && !this.hasCompletedSnapshot(nodeId);
  }

  isEdgeSatisfied(args: { nodeId: NodeId; input: InputPortKey }): boolean {
    const incomingEdges = this.topology.incomingByNode.get(args.nodeId) ?? [];
    const incomingEdge = incomingEdges.find((edge) => edge.input === args.input);
    if (!incomingEdge) {
      return false;
    }
    return this.hasOutputPort(incomingEdge.from.nodeId, incomingEdge.from.output);
  }

  resolveInput(args: { nodeId: NodeId; input: InputPortKey }): Items {
    const incomingEdges = this.topology.incomingByNode.get(args.nodeId) ?? [];
    const incomingEdge = incomingEdges.find((edge) => edge.input === args.input);
    if (!incomingEdge) {
      return [];
    }
    return this.resolveOutputItems(incomingEdge.from.nodeId, incomingEdge.from.output);
  }

  private hasOutputs(nodeId: NodeId): boolean {
    return Object.prototype.hasOwnProperty.call(this.currentState.outputsByNode, nodeId);
  }

  private hasCompletedSnapshot(nodeId: NodeId): boolean {
    const snapshot = this.currentState.nodeSnapshotsByNodeId[nodeId];
    return snapshot?.status === "completed" || snapshot?.status === "skipped";
  }

  private hasOutputPort(nodeId: NodeId, output: OutputPortKey): boolean {
    const outputs = this.currentState.outputsByNode[nodeId];
    if (!outputs) {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(outputs, output);
  }

  private resolveOutputItems(nodeId: NodeId, output: OutputPortKey): Items {
    const outputs = this.currentState.outputsByNode[nodeId];
    return outputs?.[output] ?? [];
  }
}

