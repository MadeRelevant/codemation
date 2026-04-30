import type { NodeExecutionSnapshot } from "../realtime/realtimeDomainTypes";
import type { ExecutionNode, WorkflowNode } from "./workflowDetailTypes";

/**
 * Inserts synthetic "Item N" parent rows between an agent and its connection-invocation children
 * when the agent processed 2+ items.
 *
 * The bottom execution tree previously rendered every LLM round and tool call directly under the
 * agent, intermixing items in chronological order. Per the per-item identity model, an agent that
 * runs N items should show N sibling "Item" subtrees, each containing exactly that item's LLM
 * rounds and tool calls.
 *
 * Single-item activations are left untouched — wrapping a lone item in an "Item 1" row would add
 * visual noise without conveying anything new.
 *
 * The synthetic rows:
 *   - id: `${parentAgentNodeId}::${parentAgentActivationId}::item::${iterationId}`
 *   - status / timing: derived from the item's child invocations (so the row reflects "running"
 *     while any child is in flight, "failed" if any failed, otherwise "completed")
 *   - nest under the agent via `snapshot.parent.nodeId = parentAgentNodeId`
 *
 * Each invocation row has its `parentInvocationId` re-pointed at the synthetic Item id so the
 * tree builder nests it accordingly. We deliberately leave sub-agent invocations alone — those
 * carry a real `parentInvocationId` that points at the orchestrator's tool-call row.
 */
export class ExecutionTreeItemGroupInjector {
  static inject(executionNodes: ReadonlyArray<ExecutionNode>): ReadonlyArray<ExecutionNode> {
    const groupsByAgentActivation = this.indexInvocationsByAgentActivation(executionNodes);
    if (groupsByAgentActivation.size === 0) {
      return executionNodes;
    }
    const reparentedByOriginalNodeId = new Map<string, string>();
    const itemGroupNodes: ExecutionNode[] = [];
    for (const [, group] of groupsByAgentActivation) {
      const itemBucketsByIterationId = this.partitionByIteration(group.invocations);
      if (itemBucketsByIterationId.size < 2) {
        continue;
      }
      const sortedBuckets = this.sortIterationBuckets(itemBucketsByIterationId);
      for (let bucketIndex = 0; bucketIndex < sortedBuckets.length; bucketIndex++) {
        const [iterationId, bucketInvocations] = sortedBuckets[bucketIndex]!;
        const itemNumber = bucketIndex + 1;
        const itemNode = this.createItemGroupExecutionNode({
          parentAgentNodeId: group.parentAgentNodeId,
          parentAgentActivationId: group.parentAgentActivationId,
          iterationId,
          itemNumber,
          invocations: bucketInvocations,
        });
        itemGroupNodes.push(itemNode);
        for (const invocation of bucketInvocations) {
          reparentedByOriginalNodeId.set(invocation.node.id, itemNode.node.id);
        }
      }
    }
    if (itemGroupNodes.length === 0) {
      return executionNodes;
    }
    const reparented = executionNodes.map((entry) => {
      const newParentId = reparentedByOriginalNodeId.get(entry.node.id);
      if (!newParentId) {
        return entry;
      }
      return { ...entry, parentInvocationId: newParentId } satisfies ExecutionNode;
    });
    return [...reparented, ...itemGroupNodes];
  }

  private static indexInvocationsByAgentActivation(executionNodes: ReadonlyArray<ExecutionNode>): ReadonlyMap<
    string,
    Readonly<{
      parentAgentNodeId: string;
      parentAgentActivationId: string;
      invocations: ExecutionNode[];
    }>
  > {
    const groups = new Map<
      string,
      {
        parentAgentNodeId: string;
        parentAgentActivationId: string;
        invocations: ExecutionNode[];
      }
    >();
    for (const entry of executionNodes) {
      // Only invocation rows whose immediate parent is the orchestrator agent (i.e. NOT sub-agent
      // invocations whose parentInvocationId points at a tool-call row) participate in item
      // grouping. Skip rows whose `parentInvocationId` is set to anything other than the
      // orchestrator's `parentAgentActivationId`.
      if (!entry.workflowConnectionNodeId) continue;
      if (!entry.parentAgentNodeId || !entry.parentAgentActivationId) continue;
      const directlyUnderAgent =
        entry.parentInvocationId === undefined || entry.parentInvocationId === entry.parentAgentActivationId;
      if (!directlyUnderAgent) {
        continue;
      }
      const key = `${entry.parentAgentNodeId}::${entry.parentAgentActivationId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.invocations.push(entry);
        continue;
      }
      groups.set(key, {
        parentAgentNodeId: entry.parentAgentNodeId,
        parentAgentActivationId: entry.parentAgentActivationId,
        invocations: [entry],
      });
    }
    return groups;
  }

  private static partitionByIteration(invocations: ReadonlyArray<ExecutionNode>): ReadonlyMap<string, ExecutionNode[]> {
    const buckets = new Map<string, ExecutionNode[]>();
    const fallbackKey = "__no_iteration__";
    for (const inv of invocations) {
      const key = inv.iterationId && inv.iterationId.length > 0 ? inv.iterationId : fallbackKey;
      const existing = buckets.get(key);
      if (existing) {
        existing.push(inv);
      } else {
        buckets.set(key, [inv]);
      }
    }
    if (buckets.size === 1 && buckets.has(fallbackKey)) {
      return new Map();
    }
    buckets.delete(fallbackKey);
    return buckets;
  }

  private static sortIterationBuckets(
    buckets: ReadonlyMap<string, ReadonlyArray<ExecutionNode>>,
  ): ReadonlyArray<readonly [string, ReadonlyArray<ExecutionNode>]> {
    const indexOf = (group: ReadonlyArray<ExecutionNode>): number | undefined => {
      for (const node of group) {
        if (typeof node.itemIndex === "number") return node.itemIndex;
      }
      return undefined;
    };
    const earliest = (group: ReadonlyArray<ExecutionNode>): string => {
      let min = "";
      for (const node of group) {
        const time = node.snapshot?.startedAt ?? node.snapshot?.queuedAt ?? node.snapshot?.updatedAt ?? "";
        if (min === "" || (time !== "" && time < min)) {
          min = time;
        }
      }
      return min;
    };
    return [...buckets.entries()].sort(([, leftGroup], [, rightGroup]) => {
      const leftIdx = indexOf(leftGroup);
      const rightIdx = indexOf(rightGroup);
      if (leftIdx !== rightIdx) {
        if (leftIdx === undefined) return 1;
        if (rightIdx === undefined) return -1;
        return leftIdx - rightIdx;
      }
      return earliest(leftGroup).localeCompare(earliest(rightGroup));
    });
  }

  private static createItemGroupExecutionNode(
    args: Readonly<{
      parentAgentNodeId: string;
      parentAgentActivationId: string;
      iterationId: string;
      itemNumber: number;
      invocations: ReadonlyArray<ExecutionNode>;
    }>,
  ): ExecutionNode {
    const { parentAgentNodeId, parentAgentActivationId, iterationId, itemNumber, invocations } = args;
    const itemNodeId = `${parentAgentNodeId}::${parentAgentActivationId}::item::${iterationId}`;
    const status = this.deriveItemStatus(invocations);
    const startedAt = this.minTimestamp(invocations.map((inv) => inv.snapshot?.startedAt));
    const finishedAt = this.maxTimestamp(invocations.map((inv) => inv.snapshot?.finishedAt));
    const queuedAt = this.minTimestamp(invocations.map((inv) => inv.snapshot?.queuedAt));
    const updatedAt =
      this.maxTimestamp(invocations.map((inv) => inv.snapshot?.updatedAt)) ??
      finishedAt ??
      startedAt ??
      queuedAt ??
      new Date(0).toISOString();
    const sampleInvocation = invocations[0]!;
    const sampleSnapshot = sampleInvocation.snapshot;
    const node: WorkflowNode = {
      ...sampleInvocation.node,
      id: itemNodeId,
      name: `Item ${String(itemNumber)}`,
      kind: "node",
      type: "item.group",
    } as unknown as WorkflowNode;
    const snapshot: NodeExecutionSnapshot = {
      runId: sampleSnapshot?.runId ?? "",
      workflowId: sampleSnapshot?.workflowId ?? "",
      nodeId: itemNodeId,
      activationId: parentAgentActivationId,
      parent: {
        runId: sampleSnapshot?.runId ?? "",
        workflowId: sampleSnapshot?.workflowId ?? "",
        nodeId: parentAgentNodeId,
      },
      status,
      queuedAt,
      startedAt,
      finishedAt,
      updatedAt,
    };
    return {
      node,
      snapshot,
      // `workflowNodeId = parentAgentNodeId` makes the tree builder route canvas selection and
      // properties panel resolution to the orchestrator agent itself when the user clicks an
      // "Item N" row. Without this, `canvasNodeId` would default to the synthetic id, which
      // doesn't exist in the workflow graph and would auto-close the properties panel.
      workflowNodeId: parentAgentNodeId,
      iterationId,
      itemIndex: itemNumber - 1,
      isItemGroup: true,
      parentAgentNodeId,
      parentAgentActivationId,
      // Nest the synthetic row directly under the orchestrator agent. We use
      // `parentAgentActivationId` here to mirror the original invocation pointer; the tree
      // builder falls through to `snapshot.parent.nodeId` (= parentAgentNodeId) which is
      // registered in the parent reference registry for the agent row.
      parentInvocationId: parentAgentActivationId,
    };
  }

  private static deriveItemStatus(invocations: ReadonlyArray<ExecutionNode>): NodeExecutionSnapshot["status"] {
    let hasFailed = false;
    let hasRunning = false;
    let hasQueued = false;
    let allCompleted = invocations.length > 0;
    for (const inv of invocations) {
      const status = inv.snapshot?.status;
      if (!status) {
        allCompleted = false;
        continue;
      }
      if (status === "failed") {
        hasFailed = true;
      } else if (status === "running") {
        hasRunning = true;
      } else if (status === "queued" || status === "pending") {
        hasQueued = true;
      } else if (status !== "completed" && status !== "skipped") {
        allCompleted = false;
      }
      if (status !== "completed") {
        allCompleted = false;
      }
    }
    if (hasFailed) return "failed";
    if (hasRunning) return "running";
    if (hasQueued) return "queued";
    if (allCompleted) return "completed";
    return "running";
  }

  private static minTimestamp(values: ReadonlyArray<string | undefined>): string | undefined {
    let min: string | undefined;
    for (const value of values) {
      if (!value) continue;
      if (min === undefined || value < min) min = value;
    }
    return min;
  }

  private static maxTimestamp(values: ReadonlyArray<string | undefined>): string | undefined {
    let max: string | undefined;
    for (const value of values) {
      if (!value) continue;
      if (max === undefined || value > max) max = value;
    }
    return max;
  }
}
