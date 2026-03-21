import type { InputPortKey, Items, NodeId, RunQueueEntry } from "../../../types";

import { DependencySatisfactionResolver } from "./DependencySatisfactionResolver";
import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export class FrontierQueueBuilder {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly satisfactionResolver: DependencySatisfactionResolver,
  ) {}

  build(args: { nodeId: NodeId }): RunQueueEntry[] {
    const incomingEdges = this.topology.incomingByNode.get(args.nodeId) ?? [];
    if (incomingEdges.length === 0) {
      return [];
    }
    const expectedInputs = this.topology.expectedInputsByNode.get(args.nodeId) ?? [];
    const usesCollect = expectedInputs.length !== 1 || expectedInputs[0] !== "in";
    if (usesCollect) {
      const received: Record<InputPortKey, Items> = {};
      for (const input of expectedInputs) {
        received[input] = this.satisfactionResolver.resolveInput({ nodeId: args.nodeId, input });
      }
      return [
        {
          nodeId: args.nodeId,
          input: [],
          batchId: "batch_1",
          collect: {
            expectedInputs,
            received,
          },
        },
      ];
    }
    const input = expectedInputs[0] ?? "in";
    const incomingEdge = incomingEdges.find((edge) => edge.input === input);
    return [
      {
        nodeId: args.nodeId,
        input: this.satisfactionResolver.resolveInput({ nodeId: args.nodeId, input }),
        toInput: input,
        batchId: "batch_1",
        from: incomingEdge?.from,
      },
    ];
  }
}

