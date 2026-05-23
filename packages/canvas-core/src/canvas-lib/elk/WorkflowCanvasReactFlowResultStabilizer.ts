import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from "@xyflow/react";

import type { WorkflowCanvasNodeData } from "../workflowCanvasNodeData";

type ResultShape = Readonly<{
  nodes: ReactFlowNode<WorkflowCanvasNodeData>[];
  edges: ReactFlowEdge[];
}>;

/**
 * Walks the mapper's fresh output and reuses the prior render's node/edge
 * references when the content hasn't changed. Without this, every realtime
 * event causes the mapper to emit brand-new `data` / `style` / `labelStyle`
 * objects, defeating React Flow's internal `React.memo` on node/edge
 * components and forcing the whole canvas to re-render on every WebSocket
 * tick. See React Flow's performance guide:
 *
 *   https://reactflow.dev/learn/advanced-use/performance
 *
 * "Surgical update" is the goal — only the nodes/edges whose visible state
 * actually changed get a new reference and re-render.
 */
export class WorkflowCanvasReactFlowResultStabilizer {
  static stabilize(next: ResultShape, prev: ResultShape): ResultShape {
    const stableNodes = this.stabilizeNodes(next.nodes, prev.nodes);
    const stableEdges = this.stabilizeEdges(next.edges, prev.edges);
    if (stableNodes === prev.nodes && stableEdges === prev.edges) {
      return prev;
    }
    return { nodes: stableNodes, edges: stableEdges };
  }

  private static stabilizeNodes(
    next: ReactFlowNode<WorkflowCanvasNodeData>[],
    prev: ReactFlowNode<WorkflowCanvasNodeData>[],
  ): ReactFlowNode<WorkflowCanvasNodeData>[] {
    if (next === prev) return prev;
    if (prev.length === 0) return next;
    const prevById = new Map(prev.map((n) => [n.id, n]));
    let anyChanged = false;
    const result: ReactFlowNode<WorkflowCanvasNodeData>[] = [];
    for (const candidate of next) {
      const previous = prevById.get(candidate.id);
      if (previous && this.nodesEquivalent(previous, candidate)) {
        result.push(previous);
      } else {
        result.push(candidate);
        anyChanged = true;
      }
    }
    if (!anyChanged && result.length === prev.length) {
      return prev;
    }
    return result;
  }

  private static stabilizeEdges(next: ReactFlowEdge[], prev: ReactFlowEdge[]): ReactFlowEdge[] {
    if (next === prev) return prev;
    if (prev.length === 0) return next;
    const prevById = new Map(prev.map((e) => [e.id, e]));
    let anyChanged = false;
    const result: ReactFlowEdge[] = [];
    for (const candidate of next) {
      const previous = prevById.get(candidate.id);
      if (previous && this.edgesEquivalent(previous, candidate)) {
        result.push(previous);
      } else {
        result.push(candidate);
        anyChanged = true;
      }
    }
    if (!anyChanged && result.length === prev.length) {
      return prev;
    }
    return result;
  }

  private static nodesEquivalent(
    a: ReactFlowNode<WorkflowCanvasNodeData>,
    b: ReactFlowNode<WorkflowCanvasNodeData>,
  ): boolean {
    if (a === b) return true;
    if (a.id !== b.id || a.type !== b.type) return false;
    if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;
    if (a.width !== b.width || a.height !== b.height) return false;
    if (a.draggable !== b.draggable) return false;
    if (a.sourcePosition !== b.sourcePosition || a.targetPosition !== b.targetPosition) return false;
    return this.nodeDataEquivalent(a.data, b.data);
  }

  private static nodeDataEquivalent(a: WorkflowCanvasNodeData, b: WorkflowCanvasNodeData): boolean {
    if (a === b) return true;
    if (
      a.nodeId !== b.nodeId ||
      a.label !== b.label ||
      a.type !== b.type ||
      a.kind !== b.kind ||
      a.role !== b.role ||
      a.icon !== b.icon ||
      a.status !== b.status ||
      a.selected !== b.selected ||
      a.propertiesTarget !== b.propertiesTarget ||
      a.isAttachment !== b.isAttachment ||
      a.isPinned !== b.isPinned ||
      a.hasOutputData !== b.hasOutputData ||
      a.isLiveWorkflowView !== b.isLiveWorkflowView ||
      a.isRunning !== b.isRunning ||
      a.continueWhenEmptyOutput !== b.continueWhenEmptyOutput ||
      a.hasNodeErrorHandler !== b.hasNodeErrorHandler ||
      a.credentialAttentionTooltip !== b.credentialAttentionTooltip ||
      a.showCredentialEditToolbar !== b.showCredentialEditToolbar ||
      a.layoutWidthPx !== b.layoutWidthPx ||
      a.layoutHeightPx !== b.layoutHeightPx
    ) {
      return false;
    }
    if (a.retryPolicySummary !== b.retryPolicySummary) return false;
    if (!this.stringArraysEqual(a.sourceOutputPorts, b.sourceOutputPorts)) return false;
    if (!this.stringArraysEqual(a.targetInputPorts, b.targetInputPorts)) return false;
    if (!this.numberRecordsEqual(a.sourceOutputPortCounts, b.sourceOutputPortCounts)) return false;
    if (
      a.agentAttachments.hasLanguageModel !== b.agentAttachments.hasLanguageModel ||
      a.agentAttachments.hasTools !== b.agentAttachments.hasTools
    ) {
      return false;
    }
    // Callbacks are expected to be referentially stable from the consumer
    // (they're props of useAsyncWorkflowLayout). If the consumer passes new
    // function identities each render, that's the consumer's bug, not ours.
    if (
      a.onSelectNode !== b.onSelectNode ||
      a.onOpenPropertiesNode !== b.onOpenPropertiesNode ||
      a.onRunNode !== b.onRunNode ||
      a.onTogglePinnedOutput !== b.onTogglePinnedOutput ||
      a.onEditNodeOutput !== b.onEditNodeOutput ||
      a.onClearPinnedOutput !== b.onClearPinnedOutput
    ) {
      return false;
    }
    if (a.onOpenCredentialEditFromCanvas !== b.onOpenCredentialEditFromCanvas) return false;
    return true;
  }

  private static edgesEquivalent(a: ReactFlowEdge, b: ReactFlowEdge): boolean {
    if (a === b) return true;
    if (
      a.id !== b.id ||
      a.source !== b.source ||
      a.target !== b.target ||
      a.sourceHandle !== b.sourceHandle ||
      a.targetHandle !== b.targetHandle ||
      a.type !== b.type ||
      a.animated !== b.animated ||
      a.label !== b.label ||
      a.labelBgBorderRadius !== b.labelBgBorderRadius
    ) {
      return false;
    }
    if (!this.shallowEqualUnknown(a.style, b.style)) return false;
    if (!this.shallowEqualUnknown(a.labelStyle, b.labelStyle)) return false;
    if (!this.shallowEqualUnknown(a.labelBgStyle, b.labelBgStyle)) return false;
    if (!this.shallowEqualUnknown(a.markerEnd, b.markerEnd)) return false;
    // `pathOptions` is type-specific to certain React Flow edge types (e.g.
    // SmoothStepPathOptions) and isn't on the generic Edge type — read via an
    // index access so we can compare across edge variants.
    const aPathOptions = (a as unknown as { pathOptions?: unknown }).pathOptions;
    const bPathOptions = (b as unknown as { pathOptions?: unknown }).pathOptions;
    if (!this.shallowEqualUnknown(aPathOptions, bPathOptions)) return false;
    if (!this.numberTupleEqual(a.labelBgPadding, b.labelBgPadding)) return false;
    return true;
  }

  private static stringArraysEqual(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private static numberRecordsEqual(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
    if (a === b) return true;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  private static shallowEqualUnknown(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (typeof a !== "object" || typeof b !== "object") return false;
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    const bKeys = Object.keys(bRecord);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (aRecord[key] !== bRecord[key]) return false;
    }
    return true;
  }

  private static numberTupleEqual(
    a: ReadonlyArray<number> | number | undefined,
    b: ReadonlyArray<number> | number | undefined,
  ): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    return false;
  }
}
