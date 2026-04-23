import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import { MarkerType, Position, type Edge as ReactFlowEdge, type Node as ReactFlowNode } from "@xyflow/react";

import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../../../lib/realtime/realtimeDomainTypes";
import type { WorkflowDto } from "../../../../lib/realtime/workflowTypes";
import { WorkflowCanvasEdgeCountResolver } from "../WorkflowCanvasEdgeCountResolver";
import { WorkflowCanvasEdgeStyleResolver } from "../WorkflowCanvasEdgeStyleResolver";
import {
  WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS,
  WORKFLOW_CANVAS_MAIN_EDGE_OFFSET,
} from "../workflowCanvasEdgeGeometry";
import type { AgentAttachmentFlags, WorkflowCanvasNodeData } from "../workflowCanvasNodeData";
import type { WorkflowElkNodeSizing } from "./WorkflowElkNodeSizingResolver";
import type { WorkflowElkPortInfo } from "./WorkflowElkPortInfoResolver";

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
  workflow: WorkflowDto;
  elkRoot: ElkNode;
  portInfoByNodeId: ReadonlyMap<string, WorkflowElkPortInfo>;
  sizingByNodeId: ReadonlyMap<string, WorkflowElkNodeSizing>;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
  nodeStatusesByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>;
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

type AbsolutePosition = Readonly<{ x: number; y: number }>;

/**
 * Consumes the positioned ElkNode tree and emits React Flow nodes + edges
 * with the exact data shape expected by `WorkflowCanvasCodemationNode`.
 *
 * **Agent compound parents:** ELK lays the agent card (as the compound
 * boundary) and its attachment children (inside, via the `box` algorithm)
 * into a bounding rectangle. The compound is typically much wider than
 * the card itself (it has to span N children in a row). To keep the
 * visible card, its LLM/TOOLS chip row, and the dashed attachment edges
 * visually **anchored to the card**, the parent React Flow node is
 * positioned at the card's top-left (centered horizontally inside the
 * compound area) and sized to the card's own width + shell height.
 *
 * The compound's **children** are independent React Flow nodes positioned
 * at their ELK absolute coordinates, so they still appear in the spatial
 * row ELK chose for them. React Flow's `default` (bezier) edge type
 * draws the dashed attachment edges from the card's fixed LLM/TOOLS
 * source handles down-and-out to each child — bezier arcs keep the two
 * groups of edges on separate curves (they share the same card-bottom
 * Y, so orthogonal routing would collapse them onto one horizontal
 * segment).
 */
export class WorkflowElkResultMapper {
  static toReactFlow(
    input: WorkflowElkMapperInput,
  ): Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }> {
    const absolutePositionsByNodeId = this.resolveAbsolutePositions(input);
    const agentAttachmentsByNodeId = this.resolveAgentAttachments(input.workflow);
    const nodes = this.buildReactFlowNodes(input, absolutePositionsByNodeId, agentAttachmentsByNodeId);
    const edges = this.buildReactFlowEdges(input, absolutePositionsByNodeId);
    return { nodes, edges };
  }

  /**
   * Inspects the workflow DTO and flags, per node, whether that node
   * should render an "LLM" and/or "TOOLS" attachment handle + chip. A
   * node qualifies if at least one of its children has the matching role.
   * Non-agent nodes (and agents with no attachments) get both flags
   * `false` and therefore render no chip row or attachment source
   * handles.
   */
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

  /**
   * Walks the ELK tree and records each node's **absolute top-left**.
   *
   * For agent compound parents, the recorded position is the **card's**
   * top-left — horizontally centered inside the compound's bounding
   * rectangle — rather than the compound rectangle's own top-left. This
   * keeps the rendered card visibly anchored in the middle of its
   * children row and lets the fixed LLM/TOOLS handles (rendered on the
   * card itself) serve as the visible origin for every dashed attachment
   * edge. Children stay at their absolute ELK coordinates so they appear
   * in their ELK-computed row regardless of the parent card being
   * repositioned to the visual center.
   */
  private static resolveAbsolutePositions(input: WorkflowElkMapperInput): ReadonlyMap<string, AbsolutePosition> {
    const absolutePositionsByNodeId = new Map<string, AbsolutePosition>();
    const rootChildren = input.elkRoot.children ?? [];
    for (const child of rootChildren) {
      this.walkAndRecordPositions(child, 0, 0, input.sizingByNodeId, absolutePositionsByNodeId);
    }
    return absolutePositionsByNodeId;
  }

  private static walkAndRecordPositions(
    elkNode: ElkNode,
    offsetX: number,
    offsetY: number,
    sizingByNodeId: ReadonlyMap<string, WorkflowElkNodeSizing>,
    positionsOut: Map<string, AbsolutePosition>,
  ): void {
    const nodeX = (elkNode.x ?? 0) + offsetX;
    const nodeY = (elkNode.y ?? 0) + offsetY;
    const elkWidth = elkNode.width ?? 0;
    const sizing = sizingByNodeId.get(elkNode.id);
    const cardWidth = sizing?.widthPx ?? elkWidth;

    const elkChildren = elkNode.children ?? [];
    const isCompoundParent = elkChildren.length > 0;
    const cardHorizontalOffset = isCompoundParent ? Math.max(0, (elkWidth - cardWidth) / 2) : 0;

    positionsOut.set(elkNode.id, { x: nodeX + cardHorizontalOffset, y: nodeY });

    for (const child of elkChildren) {
      this.walkAndRecordPositions(child, nodeX, nodeY, sizingByNodeId, positionsOut);
    }
  }

  private static buildReactFlowNodes(
    input: WorkflowElkMapperInput,
    positionsByNodeId: ReadonlyMap<string, AbsolutePosition>,
    agentAttachmentsByNodeId: ReadonlyMap<string, AgentAttachmentFlags>,
  ): ReactFlowNode<WorkflowCanvasNodeData>[] {
    const {
      workflow,
      portInfoByNodeId,
      sizingByNodeId,
      nodeSnapshotsByNodeId,
      nodeStatusesByNodeId,
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

    return workflow.nodes.map((n) => {
      const absPos = positionsByNodeId.get(n.id);
      const label = n.name ?? n.type ?? n.id;
      const sizing = sizingByNodeId.get(n.id);
      // The React Flow node represents only the **visible card**: its
      // position (resolved above) is the card's top-left, its width is
      // the card width, and its height is the shell height (card + label
      // slot for leaf nodes, or card + LLM/TOOLS chip row for agents).
      // Attachment children are separate React Flow nodes positioned at
      // their ELK-absolute coordinates, so the dashed attachment edges
      // route from the card's fixed LLM/TOOLS bottom handles to each
      // child without either endpoint floating detached from its card.
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
    positionsByNodeId: ReadonlyMap<string, AbsolutePosition>,
  ): ReactFlowEdge[] {
    const { workflow, nodeSnapshotsByNodeId, connectionInvocations } = input;
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
      // All LLM attachment edges share one source handle on the parent
      // card (bottom-left); all tool / nested-agent attachment edges share
      // the tools handle (bottom-right). Attachment edges render as
      // bezier curves (React Flow's `default` edge type) rather than
      // orthogonal `smoothstep` paths: both source handles sit on the
      // same bottom-of-card Y, so smoothstep paths share an intermediate
      // horizontal segment and visually collapse onto each other. A
      // bezier arc keeps each edge on its own curve and simultaneously
      // distinguishes attachment routing from the mostly-straight
      // main-chain edges above.
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
