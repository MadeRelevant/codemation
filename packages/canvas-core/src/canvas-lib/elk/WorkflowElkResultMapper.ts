import { MarkerType, Position, type Edge as ReactFlowEdge, type Node as ReactFlowNode } from "@xyflow/react";

import type { WorkflowDto } from "@codemation/host/dto";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../realtime/realtimeDomainTypes";
import { CurrentStatusLabelSelector } from "../../realtime/CurrentStatusLabelSelector";
import { WorkflowCanvasEdgeCountResolver } from "../WorkflowCanvasEdgeCountResolver";
import { WorkflowCanvasEdgeStyleResolver } from "../WorkflowCanvasEdgeStyleResolver";
import {
  WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS,
  WORKFLOW_CANVAS_MAIN_EDGE_OFFSET,
} from "../workflowCanvasEdgeGeometry";
import type { AgentAttachmentFlags, WorkflowCanvasNodeData } from "../workflowCanvasNodeData";
import type { WorkflowPositionedLayout } from "./WorkflowPositionedLayout.types";

/**
 * Source handle id used by **all** LLM attachment edges leaving an agent
 * card (one handle, possibly multiple outgoing edges fanning out to each
 * languageModel child). Kept in sync with the id the bottom-handles
 * component registers on the React Flow node.
 */
const ATTACHMENT_SOURCE_HANDLE_LLM = "attachment-source-llm";
/** Source handle id for all tool / nested-agent attachment edges. */
const ATTACHMENT_SOURCE_HANDLE_TOOLS = "attachment-source-tools";

export type WorkflowElkMapperInput = Readonly<{
  positionedLayout: WorkflowPositionedLayout;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
  nodeStatusesByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>;
  /**
   * Run-level status of the viewed run (e.g. "suspended"). Optional — only the
   * suspended-run view threads it. When `"suspended"` and a node's displayed
   * status is `"running"`, that node is marked `isWaitingForApproval`.
   */
  runStatus?: string;
  credentialAttentionTooltipByNodeId: ReadonlyMap<string, string>;
  selectedNodeId: string | null;
  propertiesTargetNodeId: string | null;
  pinnedNodeIds: ReadonlySet<string>;
  isLiveWorkflowView: boolean;
  isRunning: boolean;
  workflowNodeIdsWithBoundCredential: ReadonlySet<string>;
  onSelectNode: (nodeId: string) => void;
  onOpenPropertiesNode: (nodeId: string) => void;
  onRequestOpenCredentialEditForNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
}>;

/**
 * Consumes a pre-computed `WorkflowPositionedLayout` and emits React Flow nodes + edges
 * with the exact data shape expected by `WorkflowCanvasCodemationNode`.
 * This method is synchronous — ELK runs once upstream.
 */
export class WorkflowElkResultMapper {
  static toReactFlow(
    input: WorkflowElkMapperInput,
  ): Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }> {
    const { positionedLayout } = input;
    const agentAttachmentsByNodeId = this.resolveAgentAttachments(positionedLayout.workflow);
    const nodes = this.buildReactFlowNodes(input, positionedLayout, agentAttachmentsByNodeId);
    const edges = this.buildReactFlowEdges(input, positionedLayout);
    return { nodes, edges };
  }

  private static resolveAgentAttachments(workflow: WorkflowDto): ReadonlyMap<string, AgentAttachmentFlags> {
    const attachmentsByParentId = new Map<string, { hasLanguageModel: boolean; hasTools: boolean }>();
    for (const node of workflow.nodes) {
      if (!node.parentNodeId) continue;
      const bucket = attachmentsByParentId.get(node.parentNodeId) ?? {
        hasLanguageModel: false,
        hasTools: false,
      };
      if (node.role === "languageModel") bucket.hasLanguageModel = true;
      else if (node.role === "tool" || node.role === "nestedAgent") bucket.hasTools = true;
      attachmentsByParentId.set(node.parentNodeId, bucket);
    }
    return attachmentsByParentId;
  }

  private static buildReactFlowNodes(
    input: WorkflowElkMapperInput,
    positionedLayout: WorkflowPositionedLayout,
    agentAttachmentsByNodeId: ReadonlyMap<string, AgentAttachmentFlags>,
  ): ReactFlowNode<WorkflowCanvasNodeData>[] {
    const {
      nodeSnapshotsByNodeId,
      nodeStatusesByNodeId,
      runStatus,
      credentialAttentionTooltipByNodeId,
      selectedNodeId,
      propertiesTargetNodeId,
      pinnedNodeIds,
      isLiveWorkflowView,
      isRunning,
      workflowNodeIdsWithBoundCredential,
      onSelectNode,
      onOpenPropertiesNode,
      onRunNode,
      onTogglePinnedOutput,
      onEditNodeOutput,
      onClearPinnedOutput,
      onRequestOpenCredentialEditForNode,
    } = input;
    const { connectionInvocations } = input;
    const { workflow, positionsByNodeId, sizingByNodeId, portInfoByNodeId } = positionedLayout;

    return workflow.nodes.map((n) => {
      const absPos = positionsByNodeId.get(n.id);
      const label = n.name ?? n.type ?? n.id;
      const sizing = sizingByNodeId.get(n.id);
      const nodeWidthPx = sizing?.widthPx ?? 0;
      const nodeHeightPx = sizing?.heightPx ?? 0;
      const info = portInfoByNodeId.get(n.id);
      const sourceOutputPorts = info?.sourceOutputPorts ?? ["main"];
      const targetInputPorts = info?.targetInputPorts ?? ["in"];
      const sourceOutputPortCounts = Object.fromEntries(
        sourceOutputPorts.map((portName) => [portName, nodeSnapshotsByNodeId[n.id]?.outputs?.[portName]?.length ?? 0]),
      );
      return {
        id: n.id,
        type: "codemation",
        position: {
          x: absPos?.x ?? 0,
          y: absPos?.y ?? 0,
        },
        width: nodeWidthPx,
        height: nodeHeightPx,
        initialWidth: nodeWidthPx,
        initialHeight: nodeHeightPx,
        data: {
          nodeId: n.id,
          label,
          type: n.type,
          kind: n.kind,
          role: n.role,
          icon: n.icon,
          status: nodeStatusesByNodeId[n.id],
          isWaitingForApproval: runStatus === "suspended" && nodeStatusesByNodeId[n.id] === "running",
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
          currentStatusLabel: CurrentStatusLabelSelector.select(n.id, connectionInvocations),
          sourceOutputPorts,
          sourceOutputPortCounts,
          targetInputPorts,
          agentAttachments: agentAttachmentsByNodeId.get(n.id) ?? {
            hasLanguageModel: false,
            hasTools: false,
          },
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
          layoutWidthPx: nodeWidthPx,
          layoutHeightPx: nodeHeightPx,
        },
        draggable: false,
        sourcePosition: n.parentNodeId ? Position.Bottom : Position.Right,
        targetPosition: n.parentNodeId ? Position.Top : Position.Left,
      };
    });
  }

  private static buildReactFlowEdges(
    input: WorkflowElkMapperInput,
    positionedLayout: WorkflowPositionedLayout,
  ): ReactFlowEdge[] {
    const { workflow, positionsByNodeId } = positionedLayout;
    const { nodeSnapshotsByNodeId, connectionInvocations } = input;
    const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
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

    return workflow.edges.map((e, i) => {
      const targetNode = nodesById.get(e.to.nodeId);
      const targetRole = targetNode?.role;
      const isLlmAttachment = targetRole === "languageModel";
      const isToolAttachment = targetRole === "tool" || targetRole === "nestedAgent";
      const isAttachmentEdge = isLlmAttachment || isToolAttachment;
      const attachmentSourceHandle = isLlmAttachment
        ? ATTACHMENT_SOURCE_HANDLE_LLM
        : isToolAttachment
          ? ATTACHMENT_SOURCE_HANDLE_TOOLS
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
          ? "default"
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
  }
}
