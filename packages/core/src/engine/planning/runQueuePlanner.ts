import type { InputPortKey, Items, NodeId, OutputPortKey, RunQueueEntry } from "../../types";

import { RunQueuePlannerDiagnostics } from "./RunQueuePlannerDiagnostics";
import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export type PlannedActivation =
  | Readonly<{ kind: "single"; nodeId: NodeId; input: Items; batchId: string }>
  | Readonly<{ kind: "multi"; nodeId: NodeId; inputsByPort: Readonly<Record<InputPortKey, Items>>; batchId: string }>;

export class RunQueuePlanner {
  private readonly diagnostics: RunQueuePlannerDiagnostics;

  constructor(
    private readonly topology: WorkflowTopology,
    private readonly nodeInstances: ReadonlyMap<NodeId, unknown>,
  ) {
    this.diagnostics = new RunQueuePlannerDiagnostics(topology, nodeInstances);
  }

  validateNodeKinds(): void {
    for (const [toNodeId, inputs] of this.topology.expectedInputsByNode.entries()) {
      if (inputs.length <= 1) {
        const only = inputs[0];
        if (only && only !== "in") {
          const inst = this.nodeInstances.get(toNodeId);
          if (!this.isMultiInputNode(inst))
            throw new Error(`Node ${toNodeId} only supports input 'in' (got '${only}').`);
        }
        continue;
      }

      const inst = this.nodeInstances.get(toNodeId);
      if (!this.isMultiInputNode(inst)) {
        throw new Error(
          `Node ${toNodeId} has ${inputs.length} inbound edges. Insert a Merge node to combine branches.`,
        );
      }
    }
  }

  seedFromTrigger(args: { startNodeId: NodeId; items: Items; batchId: string }): RunQueueEntry[] {
    const queue: RunQueueEntry[] = [];
    for (const e of this.topology.outgoingByNode.get(args.startNodeId) ?? []) {
      if (e.output !== "main") continue;
      this.enqueueEdge(queue, {
        batchId: args.batchId,
        to: e.to,
        from: { nodeId: args.startNodeId, output: "main" },
        items: args.items,
      });
    }
    return queue;
  }

  applyOutputs(
    queue: RunQueueEntry[],
    args: { fromNodeId: NodeId; outputs: Record<string, Items | undefined>; batchId: string },
  ): void {
    for (const e of this.topology.outgoingByNode.get(args.fromNodeId) ?? []) {
      const outItems = (args.outputs as any)[e.output] ?? [];
      this.enqueueEdge(queue, {
        batchId: args.batchId,
        to: e.to,
        from: { nodeId: args.fromNodeId, output: e.output },
        items: outItems,
      });
    }
  }

  nextActivation(queue: RunQueueEntry[]): PlannedActivation | null {
    const readyCollect = this.resolveReadyCollect(queue);
    if (readyCollect) {
      return readyCollect;
    }

    const jobIdx = queue.findIndex((q) => !q.collect);
    if (jobIdx === -1) {
      if (queue.length === 0) return null;
      const sealedCollect = this.resolveSealedCollect(queue);
      if (sealedCollect) {
        return sealedCollect;
      }
      const stuck = queue[0]!;
      throw new Error(this.diagnostics.describeUnsatisfiedCollect(stuck));
    }

    const job = queue.splice(jobIdx, 1)[0]!;
    const def = this.topology.defsById.get(job.nodeId);
    if (!def || def.kind !== "node") return this.nextActivation(queue);
    return { kind: "single", nodeId: job.nodeId, input: job.input, batchId: job.batchId ?? "batch_1" };
  }

  sumItemsByPort(inputsByPort: Readonly<Record<InputPortKey, Items>>): number {
    let n = 0;
    for (const v of Object.values(inputsByPort)) n += v?.length ?? 0;
    return n;
  }

  private resolveReadyCollect(queue: RunQueueEntry[]): PlannedActivation | null {
    for (let i = 0; i < queue.length; i++) {
      const ready = this.tryDequeueCollect(queue, i);
      if (ready) {
        return ready;
      }
    }
    return null;
  }

  private resolveSealedCollect(queue: RunQueueEntry[]): PlannedActivation | null {
    for (let i = 0; i < queue.length; i++) {
      const queueEntry = queue[i]!;
      if (!queueEntry.collect) {
        continue;
      }
      const received = queueEntry.collect.received as Record<InputPortKey, Items>;
      if (Object.keys(received).length === 0) {
        continue;
      }
      this.fillMissingCollectInputs(queueEntry);
      const ready = this.tryDequeueCollect(queue, i);
      if (ready) {
        return ready;
      }
    }
    return null;
  }

  private tryDequeueCollect(queue: RunQueueEntry[], index: number): PlannedActivation | null {
    const queueEntry = queue[index]!;
    if (!queueEntry.collect) {
      return null;
    }
    const batchId = queueEntry.batchId ?? "batch_1";
    const expected = queueEntry.collect.expectedInputs ?? [];
    const received = queueEntry.collect.received as Record<InputPortKey, Items>;
    for (const input of expected) {
      if (!(input in received)) {
        return null;
      }
    }
    queue.splice(index, 1);
    return { kind: "multi", nodeId: queueEntry.nodeId, inputsByPort: received, batchId };
  }

  private fillMissingCollectInputs(queueEntry: RunQueueEntry): void {
    if (!queueEntry.collect) {
      return;
    }
    const received = queueEntry.collect.received as Record<InputPortKey, Items>;
    for (const input of queueEntry.collect.expectedInputs ?? []) {
      if (!(input in received)) {
        received[input] = [];
      }
    }
  }

  private enqueueEdge(
    queue: RunQueueEntry[],
    args: Readonly<{
      batchId: string;
      to: { nodeId: NodeId; input: InputPortKey };
      from: { nodeId: NodeId; output: OutputPortKey };
      items: Items;
    }>,
  ): void {
    const target = this.nodeInstances.get(args.to.nodeId);
    const isMulti = this.isMultiInputNode(target);

    if (!isMulti) {
      if (args.items.length === 0) {
        if (this.shouldContinueAfterEmptyOutputFromSource(args.from.nodeId)) {
          queue.push({
            nodeId: args.to.nodeId,
            input: args.items,
            toInput: args.to.input,
            batchId: args.batchId,
            from: args.from,
          });
          return;
        }
        this.propagateEmptyPath(queue, args.to.nodeId, args.batchId);
        return;
      }
      queue.push({
        nodeId: args.to.nodeId,
        input: args.items,
        toInput: args.to.input,
        batchId: args.batchId,
        from: args.from,
      });
      return;
    }

    const expected = this.topology.expectedInputsByNode.get(args.to.nodeId) ?? [];
    let collect = queue.find(
      (q) => q.nodeId === args.to.nodeId && (q.batchId ?? "batch_1") === args.batchId && !!q.collect,
    );
    if (!collect) {
      collect = {
        nodeId: args.to.nodeId,
        input: [],
        batchId: args.batchId,
        collect: { expectedInputs: expected, received: {} as Record<InputPortKey, Items> },
      };
      queue.push(collect);
    }

    const received = (collect.collect as any).received as Record<InputPortKey, Items>;
    received[args.to.input] = args.items;
  }

  private shouldContinueAfterEmptyOutputFromSource(fromNodeId: NodeId): boolean {
    const def = this.topology.defsById.get(fromNodeId);
    if (!def) {
      return false;
    }
    return def.config.continueWhenEmptyOutput === true;
  }

  private propagateEmptyPath(queue: RunQueueEntry[], nodeId: NodeId, batchId: string): void {
    for (const edge of this.topology.outgoingByNode.get(nodeId) ?? []) {
      this.enqueueEdge(queue, {
        batchId,
        to: edge.to,
        from: { nodeId, output: edge.output },
        items: [],
      });
    }
  }

  private isMultiInputNode(n: unknown): boolean {
    return typeof (n as any)?.executeMulti === "function";
  }
}

export { RunQueuePlannerDiagnostics } from "./RunQueuePlannerDiagnostics";
