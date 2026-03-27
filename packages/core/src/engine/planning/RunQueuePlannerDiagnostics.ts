import type { InputPortKey, Items, NodeId, RunQueueEntry } from "../../types";

import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export class RunQueuePlannerDiagnostics {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly nodeInstances: ReadonlyMap<NodeId, unknown>,
  ) {}

  describeUnsatisfiedCollect(queueEntry: RunQueueEntry): string {
    const batchId = queueEntry.batchId ?? "batch_1";
    const expectedInputs = queueEntry.collect?.expectedInputs ?? [];
    const receivedInputs = Object.keys(
      (queueEntry.collect?.received ?? {}) as Record<InputPortKey, Items>,
    ) as InputPortKey[];
    const missingInputs = expectedInputs.filter((input) => !receivedInputs.includes(input));
    const mergeNodeLabel = this.formatNodeLabel(queueEntry.nodeId);
    const receivedSummary = this.describeReceivedInputs(queueEntry);
    const missingSummary = this.describeMissingInputs(queueEntry.nodeId, missingInputs);

    return [
      `Multi-input collect is stuck at ${mergeNodeLabel} (batchId=${batchId}).`,
      `Expected inputs: ${this.formatInputList(expectedInputs)}.`,
      `Received inputs: ${receivedSummary}.`,
      `Missing inputs: ${missingSummary}.`,
    ].join(" ");
  }

  private describeReceivedInputs(queueEntry: RunQueueEntry): string {
    const received = (queueEntry.collect?.received ?? {}) as Record<InputPortKey, Items>;
    const receivedEntries = Object.entries(received);
    if (receivedEntries.length === 0) return "none";
    return receivedEntries
      .map(([input, items]) => `${input} (${items.length} item${items.length === 1 ? "" : "s"})`)
      .join(", ");
  }

  private describeMissingInputs(nodeId: NodeId, missingInputs: ReadonlyArray<InputPortKey>): string {
    if (missingInputs.length === 0) return "none";
    return missingInputs
      .map((input) => {
        const sources = this.findSources(nodeId, input);
        if (sources.length === 0) return input;
        return `${input} from ${sources.join(" or ")}`;
      })
      .join(", ");
  }

  private findSources(nodeId: NodeId, input: InputPortKey): string[] {
    const matches: string[] = [];
    for (const [sourceNodeId, edges] of this.topology.outgoingByNode.entries()) {
      for (const edge of edges) {
        if (edge.to.nodeId === nodeId && edge.to.input === input) {
          matches.push(this.formatNodeLabel(sourceNodeId));
        }
      }
    }
    return matches;
  }

  private formatInputList(inputs: ReadonlyArray<InputPortKey>): string {
    return inputs.length > 0 ? `[${inputs.join(", ")}]` : "[]";
  }

  private formatNodeLabel(nodeId: NodeId): string {
    const definition = this.topology.defsById.get(nodeId);
    const instance = this.nodeInstances.get(nodeId);
    const typeName =
      definition?.type && typeof definition.type === "function"
        ? definition.type.name
        : instance && typeof instance === "object" && "constructor" in instance
          ? ((instance.constructor as { name?: string }).name ?? "Node")
          : "Node";
    return definition?.name ? `"${definition.name}" (${typeName}:${nodeId})` : `${typeName}:${nodeId}`;
  }
}
