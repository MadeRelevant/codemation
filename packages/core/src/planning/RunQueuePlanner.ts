import type { InputPortKey, Items, NodeId, OutputPortKey, RunQueueEntry } from "../types";

import { WorkflowTopology } from "./WorkflowTopologyPlanner";
import type { TopologyOutgoingEdge } from "./WorkflowTopologyPlanner";

export type PlannedActivation =
  | Readonly<{ kind: "single"; nodeId: NodeId; input: Items; batchId: string }>
  | Readonly<{ kind: "multi"; nodeId: NodeId; inputsByPort: Readonly<Record<InputPortKey, Items>>; batchId: string }>;

export class RunQueuePlanner {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly nodeInstances: ReadonlyMap<NodeId, unknown>,
  ) {}

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
      if (!this.isMultiInputNode(inst) && !this.supportsEngineFanInMerge(inst)) {
        throw new Error(
          `Node ${toNodeId} has ${inputs.length} inbound edges but does not support multi-input execution.`,
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
        to: this.toEnqueueTarget(e),
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
        to: this.toEnqueueTarget(e),
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
      throw new Error(this.describeUnsatisfiedCollect(stuck));
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

  /**
   * Matches `CurrentStateFrontierPlanner.buildFrontierQueue`: anything that is not exactly one input
   * port named `in` participates in multi-port collect (Merge after `If` branches, etc.). Routing must
   * not depend solely on `nodeInstances.get(toNodeId)?.executeMulti`, or a Merge can be enqueued as a
   * single-input job and `NodeExecutor` will call `execute` on a multi-input-only implementation.
   */
  private usesTopologyCollectMerge(toNodeId: NodeId): boolean {
    const expectedInputs = this.topology.expectedInputsByNode.get(toNodeId) ?? [];
    if (expectedInputs.length !== 1 || expectedInputs[0] !== "in") {
      return true;
    }
    return (this.topology.incomingByNode.get(toNodeId) ?? []).length > 1;
  }

  private toEnqueueTarget(edge: TopologyOutgoingEdge): Readonly<{
    nodeId: NodeId;
    input: InputPortKey;
    collectKey: InputPortKey;
  }> {
    return edge.to;
  }

  private enqueueEdge(
    queue: RunQueueEntry[],
    args: Readonly<{
      batchId: string;
      to: { nodeId: NodeId; input: InputPortKey; collectKey: InputPortKey };
      from: { nodeId: NodeId; output: OutputPortKey };
      items: Items;
    }>,
    emptyPathSourceNodeId?: NodeId,
  ): void {
    const target = this.nodeInstances.get(args.to.nodeId);
    const isMulti = this.usesTopologyCollectMerge(args.to.nodeId) || this.isMultiInputNode(target);

    if (!isMulti) {
      if (args.items.length === 0) {
        const continueSourceNodeId = emptyPathSourceNodeId ?? args.from.nodeId;
        if (this.shouldContinueAfterEmptyOutputFromSource(continueSourceNodeId)) {
          queue.push({
            nodeId: args.to.nodeId,
            input: args.items,
            toInput: args.to.collectKey,
            batchId: args.batchId,
            from: args.from,
          });
          return;
        }
        const source = emptyPathSourceNodeId ?? args.from.nodeId;
        this.propagateEmptyPath(queue, args.to.nodeId, args.batchId, source);
        return;
      }
      queue.push({
        nodeId: args.to.nodeId,
        input: args.items,
        toInput: args.to.collectKey,
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
    received[args.to.collectKey] = args.items;
  }

  private shouldContinueAfterEmptyOutputFromSource(fromNodeId: NodeId): boolean {
    const def = this.topology.defsById.get(fromNodeId);
    if (!def) {
      return false;
    }
    return def.config.continueWhenEmptyOutput === true;
  }

  private propagateEmptyPath(
    queue: RunQueueEntry[],
    nodeId: NodeId,
    batchId: string,
    emptyPathSourceNodeId: NodeId,
  ): void {
    for (const edge of this.topology.outgoingByNode.get(nodeId) ?? []) {
      this.enqueueEdge(
        queue,
        {
          batchId,
          to: edge.to,
          from: { nodeId, output: edge.output },
          items: [],
        },
        emptyPathSourceNodeId,
      );
    }
  }

  private isMultiInputNode(n: unknown): boolean {
    return typeof (n as any)?.executeMulti === "function";
  }

  private hasRunnableExecute(n: unknown): boolean {
    return (
      typeof n === "object" &&
      n !== null &&
      (n as { kind?: string }).kind === "node" &&
      typeof (n as { execute?: unknown }).execute === "function"
    );
  }

  private supportsEngineFanInMerge(n: unknown): boolean {
    return this.hasRunnableExecute(n) && !this.isMultiInputNode(n);
  }

  private describeUnsatisfiedCollect(queueEntry: RunQueueEntry): string {
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
    if (receivedEntries.length === 0) {
      return "none";
    }
    return receivedEntries
      .map(([input, items]) => `${input} (${items.length} item${items.length === 1 ? "" : "s"})`)
      .join(", ");
  }

  private describeMissingInputs(nodeId: NodeId, missingInputs: ReadonlyArray<InputPortKey>): string {
    if (missingInputs.length === 0) {
      return "none";
    }
    return missingInputs
      .map((input) => {
        const sources = this.findSources(nodeId, input);
        if (sources.length === 0) {
          return input;
        }
        return `${input} from ${sources.join(" or ")}`;
      })
      .join(", ");
  }

  private findSources(nodeId: NodeId, input: InputPortKey): string[] {
    const matches: string[] = [];
    for (const [sourceNodeId, edges] of this.topology.outgoingByNode.entries()) {
      for (const edge of edges) {
        if (edge.to.nodeId === nodeId && edge.to.collectKey === input) {
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
