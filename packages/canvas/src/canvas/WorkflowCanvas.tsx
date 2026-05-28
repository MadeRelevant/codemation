"use client";

import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge as ReactFlowEdge,
  type NodeTypes,
  type Node as ReactFlowNode,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowDto } from "@codemation/host/dto";
import type {
  ConnectionInvocationRecord,
  NodeExecutionSnapshot,
  WorkflowCanvasConfig,
  WorkflowCanvasNodeData,
} from "@codemation/canvas-core";
import {
  WORKFLOW_CANVAS_EMBEDDED_STYLES,
  WorkflowCanvasTopologicalStatusCap,
  WorkflowElkResultMapper,
  useWorkflowCanvasRealtimePatches,
  useWorkflowElkLayout,
} from "@codemation/canvas-core";
import { workflowCanvasEdgeTypes, workflowCanvasNodeTypes } from "./lib/workflowCanvasFlowTypes";
import { WorkflowCanvasLoadingPlaceholder } from "./WorkflowCanvasLoadingPlaceholder";
import { WorkflowCanvasStructureSignature } from "./WorkflowCanvasStructureSignature";
import { VisibleNodeStatusResolver } from "./VisibleNodeStatusResolver";
import { useWorkflowCanvasFitView } from "../hooks/canvas/useWorkflowCanvasFitView";

// Stable module-level constants used as default prop values so that callers that
// omit optional collection props don't produce a new reference on every render,
// which would otherwise cause layout to re-run ELK every tick.
const EMPTY_CONNECTION_INVOCATIONS: ReadonlyArray<ConnectionInvocationRecord> = Object.freeze([]);
const EMPTY_CREDENTIAL_TOOLTIP_MAP: ReadonlyMap<string, string> = new Map<string, string>();
const EMPTY_PINNED_NODE_IDS: ReadonlySet<string> = new Set<string>();
const EMPTY_BOUND_CREDENTIAL_IDS: ReadonlySet<string> = new Set<string>();
const EMPTY_NODE_SNAPSHOTS: Readonly<Record<string, NodeExecutionSnapshot>> = Object.freeze({});
const NO_OP_NODE_CALLBACK = (): void => {};

export function WorkflowCanvas(args: {
  workflow: WorkflowDto;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
  credentialAttentionTooltipByNodeId?: ReadonlyMap<string, string>;
  selectedNodeId: string | null;
  propertiesTargetNodeId: string | null;
  pinnedNodeIds?: ReadonlySet<string>;
  isLiveWorkflowView: boolean;
  isRunning: boolean;
  /** Identity of the viewed run; a change re-seeds and resets the topo-cap ratchet (run switch). */
  runId?: string | null;
  /** Run-level status of the viewed run (e.g. "suspended"); drives the HITL "waiting for approval" treatment. */
  runStatus?: string;
  onSelectNode: (nodeId: string) => void;
  onOpenPropertiesNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
  workflowNodeIdsWithBoundCredential?: ReadonlySet<string>;
  onRequestOpenCredentialEditForNode?: (nodeId: string) => void;
  onPaneClick?: () => void;
  config?: WorkflowCanvasConfig;
}) {
  const {
    workflow,
    nodeSnapshotsByNodeId,
    connectionInvocations = EMPTY_CONNECTION_INVOCATIONS,
    credentialAttentionTooltipByNodeId = EMPTY_CREDENTIAL_TOOLTIP_MAP,
    selectedNodeId,
    propertiesTargetNodeId,
    pinnedNodeIds = EMPTY_PINNED_NODE_IDS,
    isLiveWorkflowView,
    isRunning,
    runId = null,
    runStatus,
    onSelectNode,
    onOpenPropertiesNode,
    onRunNode,
    onTogglePinnedOutput,
    onEditNodeOutput,
    onClearPinnedOutput,
    workflowNodeIdsWithBoundCredential = EMPTY_BOUND_CREDENTIAL_IDS,
    onRequestOpenCredentialEditForNode = NO_OP_NODE_CALLBACK,
    onPaneClick,
    config,
  } = args;

  const [hasMountedOnClient, setHasMountedOnClient] = useState(false);
  const [isInitialViewportReady, setIsInitialViewportReady] = useState(false);
  const workflowStructureSignature = useMemo(() => WorkflowCanvasStructureSignature.create(workflow), [workflow]);

  const noOp = useCallback(() => {}, []);
  const isReadOnly = config?.readOnly === true;
  const effectiveOnRunNode = isReadOnly ? noOp : onRunNode;
  const effectiveOnTogglePinnedOutput = isReadOnly ? noOp : onTogglePinnedOutput;
  const effectiveOnEditNodeOutput = isReadOnly ? noOp : onEditNodeOutput;

  const nodeTypes = useMemo((): NodeTypes => {
    if (config?.renderers?.node) {
      return { ...workflowCanvasNodeTypes, codemation: config.renderers.node as NodeTypes["codemation"] };
    }
    return workflowCanvasNodeTypes;
  }, [config?.renderers?.node]);

  // Controlled state
  const [nodes, setNodes, onNodesChange] = useNodesState<ReactFlowNode<WorkflowCanvasNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ReactFlowEdge>([]);

  // Mirror nodes/edges in refs so getNodes/getEdges can read them without deps
  const nodesRef = useRef<ReactFlowNode<WorkflowCanvasNodeData>[]>([]);
  const edgesRef = useRef<ReactFlowEdge[]>([]);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const getNodes = useCallback(() => nodesRef.current, []);
  const getEdges = useCallback(() => edgesRef.current, []);

  // Mirror realtime state in refs so the seed effect can read CURRENT values
  // without listing them in its deps array (which would cause a full re-seed on
  // every realtime tick). The patch hook handles incremental updates.
  const nodeSnapshotsByNodeIdRef = useRef<Readonly<Record<string, NodeExecutionSnapshot>>>(EMPTY_NODE_SNAPSHOTS);
  const connectionInvocationsRef = useRef<ReadonlyArray<ConnectionInvocationRecord>>(EMPTY_CONNECTION_INVOCATIONS);
  nodeSnapshotsByNodeIdRef.current = nodeSnapshotsByNodeId;
  connectionInvocationsRef.current = connectionInvocations;

  // ELK layout — runs only when workflow structure or role filter changes
  const positionedLayout = useWorkflowElkLayout(workflow, config);

  // seedSignature: drives Track 1 (full re-seed). Includes `isRunning` because
  // node.data.isRunning is a workflow-level flag (consumed by the toolbar's
  // "Run from here" disable rule); when it flips we need every node's data to
  // reflect the new value. The seed below reads CURRENT snapshots via refs so
  // the re-seed doesn't blank out the latest realtime state — no one-frame
  // flash like the previous "seed with EMPTY snapshots" path produced.
  const pinnedNodeIdsKey = useMemo(() => [...pinnedNodeIds].sort().join(","), [pinnedNodeIds]);
  const boundCredentialKey = useMemo(
    () => [...workflowNodeIdsWithBoundCredential].sort().join(","),
    [workflowNodeIdsWithBoundCredential],
  );
  // `runId` is included so switching between runs (same workflow, same
  // selection) re-seeds AND resets the topo-cap ratchet — otherwise a node that
  // showed `completed` in the previous run would refuse to drop back to
  // running/waiting. `runStatus` is included so a run-status transition
  // (running→suspended→completed) re-seeds and recomputes per-node
  // `isWaitingForApproval`.
  const seedSignature = useMemo(
    () =>
      [
        workflowStructureSignature,
        selectedNodeId ?? "",
        propertiesTargetNodeId ?? "",
        pinnedNodeIdsKey,
        boundCredentialKey,
        String(isLiveWorkflowView),
        String(isRunning),
        runId ?? "",
        runStatus ?? "",
      ].join("|"),
    [
      workflowStructureSignature,
      selectedNodeId,
      propertiesTargetNodeId,
      pinnedNodeIdsKey,
      boundCredentialKey,
      isLiveWorkflowView,
      isRunning,
      runId,
      runStatus,
    ],
  );

  // Track 1: seed when positionedLayout resolves or seedSignature changes.
  // Read realtime state through refs so its changes do not trigger re-seeds —
  // the patch hook below handles incremental realtime updates. Seeding with
  // the CURRENT snapshots (not EMPTY) ensures the canvas paints with the
  // correct initial node statuses / edge counts even if realtime events
  // landed before the seed effect ran.
  useEffect(() => {
    if (!positionedLayout) return;
    const seedSnapshots = nodeSnapshotsByNodeIdRef.current;
    const seedConnectionInvocations = connectionInvocationsRef.current;
    const resolvedStatuses = VisibleNodeStatusResolver.resolveStatuses(seedSnapshots, seedConnectionInvocations);
    const seedStatuses = WorkflowCanvasTopologicalStatusCap.applyCap({
      workflow,
      statusByNodeId: resolvedStatuses,
    });
    const seeded = WorkflowElkResultMapper.toReactFlow({
      positionedLayout,
      nodeSnapshotsByNodeId: seedSnapshots,
      connectionInvocations: seedConnectionInvocations,
      nodeStatusesByNodeId: seedStatuses,
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
      onRequestOpenCredentialEditForNode,
      onRunNode: effectiveOnRunNode,
      onTogglePinnedOutput: effectiveOnTogglePinnedOutput,
      onEditNodeOutput: effectiveOnEditNodeOutput,
      onClearPinnedOutput,
    });
    setNodes(seeded.nodes);
    setEdges(seeded.edges);
    // Intentionally narrow deps to positionedLayout + seedSignature. Overlay
    // values (snapshots, callbacks) are NOT seed inputs — they're applied
    // surgically by `useWorkflowCanvasRealtimePatches` below. Including them
    // here would cause full re-seeds on every realtime tick, defeating the
    // patch pipeline. Other overlay fields (selectedNodeId, pinned ids, etc.)
    // are encoded in `seedSignature` so changes to them DO re-seed.
  }, [positionedLayout, seedSignature]);

  // Track 2: patch — incremental realtime updates
  useWorkflowCanvasRealtimePatches({
    workflow,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    seedSignature,
    getNodes,
    getEdges,
    setNodes,
    setEdges,
  });

  // Fit-view extracted into hook
  const { canvasContainerRef, reactFlowInstanceRef, scheduleFitView } = useWorkflowCanvasFitView({
    nodeCount: nodes.length,
    workflowId: workflow.id,
    workflowStructureSignature,
    setIsInitialViewportReady,
    isInitialViewportReady,
  });

  useEffect(() => {
    setHasMountedOnClient(true);
  }, []);

  return (
    <div
      ref={canvasContainerRef}
      data-testid="workflow-canvas-root"
      data-workflow-structure-signature={workflowStructureSignature}
      style={{
        width: "100%",
        height: "100%",
        background: "#fbfbfc",
        fontFamily: "inherit",
        position: "relative",
      }}
    >
      {hasMountedOnClient ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={workflowCanvasEdgeTypes}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance;
            scheduleFitView();
          }}
          onNodeClick={(_event, node) => {
            onSelectNode(node.id);
            onOpenPropertiesNode(node.id);
          }}
          onPaneClick={onPaneClick}
          style={{
            fontFamily: "inherit",
            opacity: isInitialViewportReady ? 1 : 0,
            transition: "opacity 120ms ease-out",
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnScroll
          panOnScroll
        >
          <Background gap={22} size={1.1} color="#d9e0ea" />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      ) : null}
      <WorkflowCanvasLoadingPlaceholder isInitialViewportReady={isInitialViewportReady} />
      <style>{WORKFLOW_CANVAS_EMBEDDED_STYLES}</style>
    </div>
  );
}

export { VisibleNodeStatusResolver } from "./VisibleNodeStatusResolver";
export { WorkflowCanvasEdgeCountResolver } from "@codemation/canvas-core";
export { WorkflowCanvasStructureSignature } from "./WorkflowCanvasStructureSignature";
