"use client";

import {
  Background,
  Controls,
  ReactFlow,
  type Edge as ReactFlowEdge,
  type NodeTypes,
  type ReactFlowInstance,
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
import { useAsyncWorkflowLayout, WORKFLOW_CANVAS_EMBEDDED_STYLES } from "@codemation/canvas-core";
import { workflowCanvasEdgeTypes, workflowCanvasNodeTypes } from "./lib/workflowCanvasFlowTypes";
import { useWorkflowCanvasVisibleNodeStatuses } from "../hooks/canvas/useWorkflowCanvasVisibleNodeStatuses";
import { WorkflowCanvasLoadingPlaceholder } from "./WorkflowCanvasLoadingPlaceholder";
import { WorkflowCanvasStructureSignature } from "./WorkflowCanvasStructureSignature";

// Stable module-level constants used as default prop values so that callers that
// omit optional collection props don't produce a new reference on every render,
// which would otherwise cause useAsyncWorkflowLayout to re-run ELK every tick.
const EMPTY_CONNECTION_INVOCATIONS: ReadonlyArray<ConnectionInvocationRecord> = Object.freeze([]);
const EMPTY_CREDENTIAL_TOOLTIP_MAP: ReadonlyMap<string, string> = new Map<string, string>();
const EMPTY_PINNED_NODE_IDS: ReadonlySet<string> = new Set<string>();
const EMPTY_BOUND_CREDENTIAL_IDS: ReadonlySet<string> = new Set<string>();
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
  onSelectNode: (nodeId: string) => void;
  onOpenPropertiesNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
  workflowNodeIdsWithBoundCredential?: ReadonlySet<string>;
  onRequestOpenCredentialEditForNode?: (nodeId: string) => void;
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
    onSelectNode,
    onOpenPropertiesNode,
    onRunNode,
    onTogglePinnedOutput,
    onEditNodeOutput,
    onClearPinnedOutput,
    workflowNodeIdsWithBoundCredential = EMPTY_BOUND_CREDENTIAL_IDS,
    onRequestOpenCredentialEditForNode = NO_OP_NODE_CALLBACK,
    config,
  } = args;
  const [hasMountedOnClient, setHasMountedOnClient] = useState(false);
  const [isInitialViewportReady, setIsInitialViewportReady] = useState(false);
  const workflowStructureSignature = useMemo(() => WorkflowCanvasStructureSignature.create(workflow), [workflow]);
  const visibleNodeStatusesByNodeId = useWorkflowCanvasVisibleNodeStatuses(
    nodeSnapshotsByNodeId,
    connectionInvocations,
  );

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

  const { nodes, edges } = useAsyncWorkflowLayout({
    workflow,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    visibleNodeStatusesByNodeId,
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
    config,
  });
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<ReactFlowNode<WorkflowCanvasNodeData>, ReactFlowEdge> | null>(
    null,
  );
  const fitViewAnimationFrameIdRef = useRef<number | null>(null);
  const fitViewTimeoutIdRef = useRef<number | null>(null);
  const fitViewRequestIdRef = useRef(0);
  const fitViewOptions = useMemo(
    () =>
      ({
        padding: 0.24,
        minZoom: 0.2,
        maxZoom: 1,
      }) as const,
    [],
  );
  const scheduleFitView = useCallback(() => {
    const canvasContainer = canvasContainerRef.current;
    const reactFlowInstance = reactFlowInstanceRef.current;
    if (!canvasContainer || !reactFlowInstance || nodes.length === 0) {
      return;
    }
    if (canvasContainer.clientWidth === 0 || canvasContainer.clientHeight === 0) {
      return;
    }
    if (fitViewAnimationFrameIdRef.current !== null) {
      cancelAnimationFrame(fitViewAnimationFrameIdRef.current);
    }
    fitViewRequestIdRef.current += 1;
    const requestId = fitViewRequestIdRef.current;
    fitViewAnimationFrameIdRef.current = requestAnimationFrame(() => {
      fitViewAnimationFrameIdRef.current = requestAnimationFrame(() => {
        fitViewAnimationFrameIdRef.current = null;
        void reactFlowInstance.fitView(fitViewOptions).then(() => {
          if (requestId !== fitViewRequestIdRef.current) {
            return;
          }
          setIsInitialViewportReady(true);
        });
      });
    });
  }, [fitViewOptions, nodes.length]);

  useEffect(() => {
    setHasMountedOnClient(true);
  }, []);

  useEffect(() => {
    setIsInitialViewportReady(false);
  }, [workflow.id, workflowStructureSignature]);

  useEffect(() => {
    scheduleFitView();
    if (fitViewTimeoutIdRef.current !== null) {
      window.clearTimeout(fitViewTimeoutIdRef.current);
    }
    fitViewTimeoutIdRef.current = window.setTimeout(() => {
      fitViewTimeoutIdRef.current = null;
      scheduleFitView();
    }, 120);
  }, [scheduleFitView, workflow.id, workflowStructureSignature]);

  useEffect(() => {
    const canvasContainer = canvasContainerRef.current;
    if (!canvasContainer || typeof ResizeObserver === "undefined") {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      if (isInitialViewportReady) {
        return;
      }
      scheduleFitView();
    });
    resizeObserver.observe(canvasContainer);
    return () => {
      resizeObserver.disconnect();
    };
  }, [isInitialViewportReady, scheduleFitView]);

  useEffect(() => {
    return () => {
      if (fitViewAnimationFrameIdRef.current !== null) {
        cancelAnimationFrame(fitViewAnimationFrameIdRef.current);
      }
      if (fitViewTimeoutIdRef.current !== null) {
        window.clearTimeout(fitViewTimeoutIdRef.current);
      }
    };
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
