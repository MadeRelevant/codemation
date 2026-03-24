import dagre from "dagre";
import { MarkerType,Position,type Edge as ReactFlowEdge,type Node as ReactFlowNode } from "@xyflow/react";

import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../../lib/realtime/realtimeDomainTypes";
import type { WorkflowDto } from "../../../lib/realtime/workflowTypes";
import type { WorkflowCanvasNodeData } from "./workflowCanvasNodeData";
import { WorkflowCanvasEdgeCountResolver } from "./WorkflowCanvasEdgeCountResolver";
import { WorkflowCanvasEdgeStyleResolver } from "./WorkflowCanvasEdgeStyleResolver";

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
  onSelectNode: (nodeId: string) => void,
  onOpenPropertiesNode: (nodeId: string) => void,
  onRunNode: (nodeId: string) => void,
  onTogglePinnedOutput: (nodeId: string) => void,
  onEditNodeOutput: (nodeId: string) => void,
  onClearPinnedOutput: (nodeId: string) => void,
): Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }> {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 28, edgesep: 12 });

  const nodeWidth = 196;
  const nodeHeight = 54;
  const attachmentNodeWidth = 144;
  const attachmentNodeHeight = 54;
  const branchSpacing = nodeHeight + 28;
  const attachmentYOffset = 118;
  const attachmentXSpacing = attachmentNodeWidth + 26;
  const layoutNodes = workflow.nodes.filter((node) => !node.parentNodeId);
  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  const layoutEdges = workflow.edges.filter((edge) => layoutNodeIds.has(edge.from.nodeId) && layoutNodeIds.has(edge.to.nodeId));

  for (const node of layoutNodes) {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
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

  const outgoingNodeIdsByNodeId = new Map<string, string[]>();
  const incomingNodeIdsByNodeId = new Map<string, string[]>();
  for (const edge of layoutEdges) {
    const outgoing = outgoingNodeIdsByNodeId.get(edge.from.nodeId) ?? [];
    outgoing.push(edge.to.nodeId);
    outgoingNodeIdsByNodeId.set(edge.from.nodeId, outgoing);

    const incoming = incomingNodeIdsByNodeId.get(edge.to.nodeId) ?? [];
    incoming.push(edge.from.nodeId);
    incomingNodeIdsByNodeId.set(edge.to.nodeId, incoming);
  }

  for (const node of layoutNodes) {
    const childNodeIds = outgoingNodeIdsByNodeId.get(node.id) ?? [];
    if (childNodeIds.length < 2) continue;

    const parentPosition = positionsByNodeId.get(node.id);
    if (!parentPosition) continue;

    const orderedChildNodeIds = [...childNodeIds].sort((leftNodeId, rightNodeId) => {
      const leftY = positionsByNodeId.get(leftNodeId)?.y ?? 0;
      const rightY = positionsByNodeId.get(rightNodeId)?.y ?? 0;
      return leftY - rightY;
    });

    orderedChildNodeIds.forEach((childNodeId, index) => {
      const childPosition = positionsByNodeId.get(childNodeId);
      if (!childPosition) return;

      positionsByNodeId.set(childNodeId, {
        x: childPosition.x,
        y: parentPosition.y + (index - (orderedChildNodeIds.length - 1) / 2) * branchSpacing,
      });
    });
  }

  for (const node of layoutNodes) {
    const parentNodeIds = incomingNodeIdsByNodeId.get(node.id) ?? [];
    if (parentNodeIds.length < 2) continue;

    const nodePosition = positionsByNodeId.get(node.id);
    if (!nodePosition) continue;

    const averageParentY =
      parentNodeIds.reduce((sum, parentNodeId) => sum + (positionsByNodeId.get(parentNodeId)?.y ?? nodePosition.y), 0) / parentNodeIds.length;

    positionsByNodeId.set(node.id, {
      x: nodePosition.x,
      y: averageParentY,
    });
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
    const orderedAttachmentNodes = [...attachmentNodes].sort((left, right) => {
      if (left.role === right.role) return left.name?.localeCompare(right.name ?? "") ?? 0;
      if (left.role === "languageModel") return -1;
      if (right.role === "languageModel") return 1;
      return 0;
    });
    orderedAttachmentNodes.forEach((attachmentNode, index) => {
      positionsByNodeId.set(attachmentNode.id, {
        x: parentPosition.x + (index - (attachmentNodes.length - 1) / 2) * attachmentXSpacing,
        y: parentPosition.y + attachmentYOffset,
      });
    });
  }

  const nodes: ReactFlowNode<WorkflowCanvasNodeData>[] = workflow.nodes.map((n) => {
    const pos = positionsByNodeId.get(n.id);
    const label = n.name ?? n.type ?? n.id;
    const resolvedNodeWidth = n.parentNodeId ? attachmentNodeWidth : nodeWidth;
    const resolvedNodeHeight = n.parentNodeId ? attachmentNodeHeight : nodeHeight;
    return {
      id: n.id,
      type: "codemation",
      position: {
        x: (pos?.x ?? 0) - resolvedNodeWidth / 2,
        y: (pos?.y ?? 0) - resolvedNodeHeight / 2,
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
        hasOutputData: Boolean(pinnedNodeIds.has(n.id) || nodeSnapshotsByNodeId[n.id]?.outputs?.main),
        isLiveWorkflowView,
        isRunning,
        retryPolicySummary: n.retryPolicySummary,
        hasNodeErrorHandler: n.hasNodeErrorHandler,
        credentialAttentionTooltip: credentialAttentionTooltipByNodeId.get(n.id),
        onSelectNode,
        onOpenPropertiesNode,
        onRunNode,
        onTogglePinnedOutput,
        onEditNodeOutput,
        onClearPinnedOutput,
      },
      draggable: false,
      sourcePosition: n.parentNodeId ? Position.Bottom : Position.Right,
      targetPosition: n.parentNodeId ? Position.Top : Position.Left,
    };
  });

  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const edges: ReactFlowEdge[] = workflow.edges.map((e, i) => {
    const targetNode = nodesById.get(e.to.nodeId);
    const isAttachmentEdge = targetNode?.role === "languageModel" || targetNode?.role === "tool";
    const attachmentSourceHandle =
      targetNode?.role === "languageModel" ? "attachment-llm-source" : targetNode?.role === "tool" ? "attachment-tools-source" : undefined;
    const sourcePosition = positionsByNodeId.get(e.from.nodeId);
    const targetPosition = positionsByNodeId.get(e.to.nodeId);
    const isStraightMainEdge = !isAttachmentEdge && Math.abs((sourcePosition?.y ?? 0) - (targetPosition?.y ?? 0)) < 1;
    const targetSnapshot = nodeSnapshotsByNodeId[e.to.nodeId];
    const sourceSnapshot = nodeSnapshotsByNodeId[e.from.nodeId];
    const edgeItemCount = WorkflowCanvasEdgeCountResolver.resolveCount({
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
    return {
      id: `${e.from.nodeId}:${e.from.output}->${e.to.nodeId}:${e.to.input}:${i}`,
      source: e.from.nodeId,
      target: e.to.nodeId,
      sourceHandle: isAttachmentEdge ? attachmentSourceHandle : undefined,
      targetHandle: isAttachmentEdge ? "attachment-target" : undefined,
      animated: false,
      type: isAttachmentEdge ? "smoothstep" : isStraightMainEdge ? "straightCount" : "step",
      style: {
        stroke: edgeStroke,
        strokeWidth: isAttachmentEdge ? 1.35 : 1.5,
        strokeDasharray: isAttachmentEdge ? "2 6" : undefined,
        strokeLinecap: isAttachmentEdge ? "round" : undefined,
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
      labelBgBorderRadius: 0,
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
