import type { InputPortKey, Items, NodeId, OutputPortKey, RunQueueEntry } from "../../types";
import { WorkflowTopology } from "./workflowTopology";

export type PlannedActivation =
  | Readonly<{ kind: "single"; nodeId: NodeId; input: Items; batchId: string }>
  | Readonly<{ kind: "multi"; nodeId: NodeId; inputsByPort: Readonly<Record<InputPortKey, Items>>; batchId: string }>;

class RunQueuePlannerDiagnostics {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly nodeInstances: ReadonlyMap<NodeId, unknown>,
  ) {}

  describeUnsatisfiedCollect(queueEntry: RunQueueEntry): string {
    const batchId = queueEntry.batchId ?? "batch_1";
    const expectedInputs = queueEntry.collect?.expectedInputs ?? [];
    const receivedInputs = Object.keys((queueEntry.collect?.received ?? {}) as Record<InputPortKey, Items>) as InputPortKey[];
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
          ? (instance.constructor as { name?: string }).name ?? "Node"
          : "Node";
    return definition?.name ? `"${definition.name}" (${typeName}:${nodeId})` : `${typeName}:${nodeId}`;
  }
}

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
          if (!this.isMultiInputNode(inst)) throw new Error(`Node ${toNodeId} only supports input 'in' (got '${only}').`);
        }
        continue;
      }

      const inst = this.nodeInstances.get(toNodeId);
      if (!this.isMultiInputNode(inst)) {
        throw new Error(`Node ${toNodeId} has ${inputs.length} inbound edges. Insert a Merge node to combine branches.`);
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

  applyOutputs(queue: RunQueueEntry[], args: { fromNodeId: NodeId; outputs: Record<string, Items | undefined>; batchId: string }): void {
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
    // Prefer ready collect jobs.
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i]!;
      if (!q.collect) continue;

      const batchId = q.batchId ?? "batch_1";
      const expected = q.collect.expectedInputs ?? [];
      const received = q.collect.received as Record<InputPortKey, Items>;

      let done = true;
      for (const k of expected) {
        if (!(k in received)) {
          done = false;
          break;
        }
      }
      if (!done) continue;

      queue.splice(i, 1);
      return { kind: "multi", nodeId: q.nodeId, inputsByPort: received, batchId };
    }

    const jobIdx = queue.findIndex((q) => !q.collect);
    if (jobIdx === -1) {
      if (queue.length === 0) return null;
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
    let collect = queue.find((q) => q.nodeId === args.to.nodeId && (q.batchId ?? "batch_1") === args.batchId && !!q.collect);
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

