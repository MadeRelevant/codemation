import dagre from "dagre";
import { MarkerType, Position, type Edge as ReactFlowEdge, type Node as ReactFlowNode } from "@xyflow/react";

import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../../lib/realtime/realtimeDomainTypes";
import type { WorkflowDto } from "../../../lib/realtime/workflowTypes";
import type { WorkflowCanvasNodeData } from "./workflowCanvasNodeData";
import { WorkflowCanvasEdgeCountResolver } from "./WorkflowCanvasEdgeCountResolver";
import { WorkflowCanvasEdgeStyleResolver } from "./WorkflowCanvasEdgeStyleResolver";
import {
  WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS,
  WORKFLOW_CANVAS_MAIN_EDGE_OFFSET,
} from "./workflowCanvasEdgeGeometry";
import {
  WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX,
  WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
  WorkflowCanvasNodeGeometry,
} from "./workflowCanvasNodeGeometry";

function isNestedAgentRole(role: string | undefined): boolean {
  return role === "nestedAgent";
}

function mainWorkflowNodeWidthPx(role: string | undefined): number {
  return WorkflowCanvasNodeGeometry.mainNodeWidthPx(role === "agent" || role === "nestedAgent");
}

function attachmentLayoutWidthPx(role: string | undefined): number {
  return isNestedAgentRole(role)
    ? WorkflowCanvasNodeGeometry.mainNodeWidthPx(true)
    : WorkflowCanvasNodeGeometry.attachmentNodeWidthPx();
}

function attachmentLayoutHeightPx(label: string, role: string | undefined): number {
  return isNestedAgentRole(role)
    ? WorkflowCanvasNodeGeometry.mainNodeHeightPx(label, true)
    : WorkflowCanvasNodeGeometry.attachmentNodeHeightPx(label);
}

function attachmentLayoutCardHeightPx(role: string | undefined): number {
  return isNestedAgentRole(role) ? WORKFLOW_CANVAS_MAIN_NODE_CARD_PX : WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX;
}

function attachmentChildCardHalfHeightPx(role: string | undefined): number {
  return attachmentLayoutCardHeightPx(role) / 2;
}
import { WorkflowCanvasOverlapResolver } from "./WorkflowCanvasOverlapResolver";
import { WorkflowCanvasPortOrderResolver } from "./WorkflowCanvasPortOrderResolver";

export function layoutWorkflow(
  workflow: WorkflowDto,
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
  nodeStatusesByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>,
  credentialAttentionTooltipByNodeId: ReadonlyMap<string, string>,
  selectedNodeId: string | null,
  propertiesTargetNodeId: string | null,
  pinnedNodeIds: ReadonlySet<string>,
  isLiveWorkflowView: boolean,
  isRunning: boolean,
  workflowNodeIdsWithBoundCredential: ReadonlySet<string>,
  onSelectNode: (nodeId: string) => void,
  onOpenPropertiesNode: (nodeId: string) => void,
  onRequestOpenCredentialEditForNode: (nodeId: string) => void,
  onRunNode: (nodeId: string) => void,
  onTogglePinnedOutput: (nodeId: string) => void,
  onEditNodeOutput: (nodeId: string) => void,
  onClearPinnedOutput: (nodeId: string) => void,
): Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }> {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", ranksep: 128, nodesep: 56, edgesep: 20 });

  const layoutNodes = workflow.nodes.filter((node) => !node.parentNodeId);
  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  const layoutEdges = workflow.edges.filter(
    (edge) => layoutNodeIds.has(edge.from.nodeId) && layoutNodeIds.has(edge.to.nodeId),
  );

  for (const node of layoutNodes) {
    dagreGraph.setNode(node.id, {
      width: mainWorkflowNodeWidthPx(node.role),
      height: WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
    });
  }
  for (const [i, edge] of layoutEdges.entries()) {
    dagreGraph.setEdge(edge.from.nodeId, edge.to.nodeId, { i });
  }

  dagre.layout(dagreGraph);

  const positionsByNodeId = new Map<string, { x: number; y: number }>();
  for (const node of layoutNodes) {
    const position = dagreGraph.node(node.id) as { x: number; y: number } | undefined;
    positionsByNodeId.set(node.id, { x: position?.x ?? 0, y: position?.y ?? 0 });
  }

  const attachmentNodesByParentNodeId = new Map<string, WorkflowDto["nodes"]>();
  for (const node of workflow.nodes) {
    if (!node.parentNodeId) continue;
    const siblings = attachmentNodesByParentNodeId.get(node.parentNodeId) ?? [];
    attachmentNodesByParentNodeId.set(node.parentNodeId, [...siblings, node]);
  }

  for (const [parentNodeId, attachmentNodes] of attachmentNodesByParentNodeId.entries()) {
    const parentPosition = positionsByNodeId.get(parentNodeId);
    if (!parentPosition) continue;
    const parentMeta = layoutNodes.find((n) => n.id === parentNodeId);
    const parentLabel = parentMeta?.name ?? parentMeta?.type ?? parentNodeId;
    const parentIsAgent = parentMeta?.role === "agent" || parentMeta?.role === "nestedAgent";
    if (attachmentNodes.length === 0) {
      continue;
    }
    const maxChildCardHalfPx = Math.max(...attachmentNodes.map((an) => attachmentChildCardHalfHeightPx(an.role)));
    const attachmentYOffset = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter(
      parentLabel,
      parentIsAgent,
      maxChildCardHalfPx,
    );
    const maxAttachmentStackWidthPx = Math.max(...attachmentNodes.map((an) => attachmentLayoutWidthPx(an.role)));
    const attachmentXSpacing = maxAttachmentStackWidthPx + 36;
    const orderedAttachmentNodes = [...attachmentNodes].sort((left, right) => {
      if (left.role === right.role) return left.name?.localeCompare(right.name ?? "") ?? 0;
      if (left.role === "languageModel") return -1;
      if (right.role === "languageModel") return 1;
      if (left.role === "nestedAgent") return -1;
      if (right.role === "nestedAgent") return 1;
      return 0;
    });
    orderedAttachmentNodes.forEach((attachmentNode, index) => {
      positionsByNodeId.set(attachmentNode.id, {
        x: parentPosition.x + (index - (attachmentNodes.length - 1) / 2) * attachmentXSpacing,
        y: parentPosition.y + attachmentYOffset,
      });
    });
  }

  const widthByNodeId = new Map<string, number>();
  const heightByNodeId = new Map<string, number>();
  for (const n of workflow.nodes) {
    const label = n.name ?? n.type ?? n.id;
    if (n.parentNodeId) {
      widthByNodeId.set(n.id, attachmentLayoutWidthPx(n.role));
      heightByNodeId.set(n.id, attachmentLayoutHeightPx(label, n.role));
    } else {
      widthByNodeId.set(n.id, mainWorkflowNodeWidthPx(n.role));
      heightByNodeId.set(n.id, WORKFLOW_CANVAS_MAIN_NODE_CARD_PX);
    }
  }
  const resolvedPositions = WorkflowCanvasOverlapResolver.resolve({
    positionsByNodeId,
    widthByNodeId,
    heightByNodeId,
    gap: 10,
  });
  for (const [id, pos] of resolvedPositions) {
    positionsByNodeId.set(id, pos);
  }

  const outgoingOutputsByNodeId = new Map<string, Set<string>>();
  const incomingInputsByNodeId = new Map<string, Set<string>>();
  for (const edge of workflow.edges) {
    if (!outgoingOutputsByNodeId.has(edge.from.nodeId)) {
      outgoingOutputsByNodeId.set(edge.from.nodeId, new Set());
    }
    outgoingOutputsByNodeId.get(edge.from.nodeId)!.add(edge.from.output);
    if (!incomingInputsByNodeId.has(edge.to.nodeId)) {
      incomingInputsByNodeId.set(edge.to.nodeId, new Set());
    }
    incomingInputsByNodeId.get(edge.to.nodeId)!.add(edge.to.input);
  }

  const nodes: ReactFlowNode<WorkflowCanvasNodeData>[] = workflow.nodes.map((n) => {
    const pos = positionsByNodeId.get(n.id);
    const label = n.name ?? n.type ?? n.id;
    const resolvedNodeWidth = n.parentNodeId ? attachmentLayoutWidthPx(n.role) : mainWorkflowNodeWidthPx(n.role);
    const resolvedNodeHeight = n.parentNodeId
      ? attachmentLayoutHeightPx(label, n.role)
      : WorkflowCanvasNodeGeometry.mainNodeHeightPx(label, n.role === "agent" || n.role === "nestedAgent");
    const layoutCardHeightPx = n.parentNodeId
      ? attachmentLayoutCardHeightPx(n.role)
      : WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
    const rawOut = outgoingOutputsByNodeId.get(n.id);
    const rawIn = incomingInputsByNodeId.get(n.id);
    const fromEdgesOut = rawOut && rawOut.size > 0 ? [...rawOut] : [];
    const declaredOut = n.declaredOutputPorts ?? [];
    const baseOut = [...new Set([...declaredOut, ...fromEdgesOut])];
    const combinedOut =
      baseOut.length > 0
        ? [...new Set([...baseOut, ...(n.hasNodeErrorHandler ? ["error"] : [])])]
        : n.hasNodeErrorHandler
          ? (["main", "error"] as const)
          : (["main"] as const);
    const sourceOutputPorts = WorkflowCanvasPortOrderResolver.sortSourceOutputs(combinedOut);
    const sourceOutputPortCounts = Object.fromEntries(
      sourceOutputPorts.map((portName) => [portName, nodeSnapshotsByNodeId[n.id]?.outputs?.[portName]?.length ?? 0]),
    );
    const fromEdgesIn = rawIn && rawIn.size > 0 ? [...rawIn] : [];
    const declaredIn = n.declaredInputPorts ?? [];
    const combinedIn = [...new Set([...declaredIn, ...fromEdgesIn])];
    const targetInputPorts = WorkflowCanvasPortOrderResolver.sortTargetInputs(
      combinedIn.length > 0 ? combinedIn : ["in"],
    );
    return {
      id: n.id,
      type: "codemation",
      position: {
        x: (pos?.x ?? 0) - resolvedNodeWidth / 2,
        y: (pos?.y ?? 0) - layoutCardHeightPx / 2,
      },
      width: resolvedNodeWidth,
      height: resolvedNodeHeight,
      initialWidth: resolvedNodeWidth,
      initialHeight: resolvedNodeHeight,
      data: {
        nodeId: n.id,
        label,
        type: n.type,
        kind: n.kind,
        role: n.role,
        icon: n.icon,
        status: nodeStatusesByNodeId[n.id],
        selected: selectedNodeId === n.id,
        propertiesTarget: propertiesTargetNodeId === n.id,
        isAttachment: Boolean(n.parentNodeId),
        isPinned: pinnedNodeIds.has(n.id),
        hasOutputData: Boolean(pinnedNodeIds.has(n.id) || nodeSnapshotsByNodeId[n.id]?.outputs !== undefined),
        isLiveWorkflowView,
        isRunning,
        retryPolicySummary: n.retryPolicySummary,
        hasNodeErrorHandler: n.hasNodeErrorHandler,
        continueWhenEmptyOutput: n.continueWhenEmptyOutput,
        credentialAttentionTooltip: credentialAttentionTooltipByNodeId.get(n.id),
        sourceOutputPorts,
        sourceOutputPortCounts,
        targetInputPorts,
        onSelectNode,
        onOpenPropertiesNode,
        onRunNode,
        onTogglePinnedOutput,
        onEditNodeOutput,
        onClearPinnedOutput,
        showCredentialEditToolbar: isLiveWorkflowView && workflowNodeIdsWithBoundCredential.has(n.id),
        onOpenCredentialEditFromCanvas:
          isLiveWorkflowView && workflowNodeIdsWithBoundCredential.has(n.id)
            ? () => onRequestOpenCredentialEditForNode(n.id)
            : undefined,
        layoutWidthPx: resolvedNodeWidth,
        layoutHeightPx: resolvedNodeHeight,
      },
      draggable: false,
      sourcePosition: n.parentNodeId ? Position.Bottom : Position.Right,
      targetPosition: n.parentNodeId ? Position.Top : Position.Left,
    };
  });

  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const edges: ReactFlowEdge[] = workflow.edges.map((e, i) => {
    const targetNode = nodesById.get(e.to.nodeId);
    const isAttachmentEdge =
      targetNode?.role === "languageModel" || targetNode?.role === "tool" || targetNode?.role === "nestedAgent";
    const attachmentSourceHandle =
      targetNode?.role === "languageModel"
        ? "attachment-llm-source"
        : targetNode?.role === "tool" || targetNode?.role === "nestedAgent"
          ? "attachment-tools-source"
          : undefined;
    const outgoingFromSourceCount = outgoingOutputsByNodeId.get(e.from.nodeId)?.size ?? 0;
    const incomingToTargetCount = incomingInputsByNodeId.get(e.to.nodeId)?.size ?? 0;
    const useSharedBranchTargetHandle = !isAttachmentEdge && incomingToTargetCount > 1;
    const sourcePosition = positionsByNodeId.get(e.from.nodeId);
    const targetPosition = positionsByNodeId.get(e.to.nodeId);
    const isStraightMainEdge = !isAttachmentEdge && Math.abs((sourcePosition?.y ?? 0) - (targetPosition?.y ?? 0)) < 1;
    const targetSnapshot = nodeSnapshotsByNodeId[e.to.nodeId];
    const sourceSnapshot = nodeSnapshotsByNodeId[e.from.nodeId];
    const edgeItemCount = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: e.from.nodeId,
      targetNodeId: e.to.nodeId,
      targetNodeRole: targetNode?.role,
      targetInput: e.to.input,
      sourceOutput: e.from.output,
      sourceSnapshot,
      targetSnapshot,
      nodeSnapshotsByNodeId,
      connectionInvocations,
    });
    const edgeLabel = edgeItemCount > 0 ? `${edgeItemCount} item${edgeItemCount === 1 ? "" : "s"}` : undefined;
    const edgeStroke = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({
      edgeItemCount,
      isAttachmentEdge,
    });
    const mainSourceHandle = isAttachmentEdge ? attachmentSourceHandle : e.from.output;
    const mainTargetHandle = isAttachmentEdge
      ? "attachment-target"
      : useSharedBranchTargetHandle
        ? undefined
        : e.to.input;
    const isForkOutgoingEdge = !isAttachmentEdge && !isStraightMainEdge && outgoingFromSourceCount > 1;
    return {
      id: `${e.from.nodeId}:${e.from.output}->${e.to.nodeId}:${e.to.input}:${i}`,
      source: e.from.nodeId,
      target: e.to.nodeId,
      sourceHandle: mainSourceHandle,
      targetHandle: mainTargetHandle,
      animated: false,
      type: isAttachmentEdge
        ? "smoothstep"
        : isStraightMainEdge
          ? "straightCount"
          : isForkOutgoingEdge
            ? "symmetricFork"
            : "smoothstep",
      pathOptions:
        isAttachmentEdge || isStraightMainEdge || isForkOutgoingEdge
          ? undefined
          : {
              borderRadius: WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS,
              offset: WORKFLOW_CANVAS_MAIN_EDGE_OFFSET,
              stepPosition: 0.5,
            },
      style: {
        stroke: edgeStroke,
        strokeWidth: isAttachmentEdge ? 1.35 : 1.5,
        strokeDasharray: isAttachmentEdge ? "2 6" : undefined,
        strokeLinecap: isAttachmentEdge ? "round" : "round",
        strokeLinejoin: isAttachmentEdge ? undefined : "round",
      },
      label: edgeLabel,
      labelStyle: {
        fill: WorkflowCanvasEdgeStyleResolver.resolveLabelFill({
          edgeItemCount,
          isAttachmentEdge,
        }),
        fontSize: isAttachmentEdge ? 10 : 11,
        fontWeight: 800,
      },
      labelBgStyle: {
        fill: WorkflowCanvasEdgeStyleResolver.resolveLabelBackground({
          edgeItemCount,
          isAttachmentEdge,
        }),
        fillOpacity: 1,
      },
      labelBgPadding: isAttachmentEdge ? [4, 2] : [6, 3],
      labelBgBorderRadius: 4,
      markerEnd: isAttachmentEdge
        ? undefined
        : {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: edgeStroke,
          },
    };
  });

  return { nodes, edges };
}
