"use client";

import { Background,Controls,ReactFlow,type Edge as ReactFlowEdge,type ReactFlowInstance,type Node as ReactFlowNode } from "@xyflow/react";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";

import type { NodeExecutionSnapshot } from "../realtime/realtime";
import type { WorkflowDto } from "../realtime/workflowTypes";
import { layoutWorkflow } from "./layoutWorkflow";
import type { WorkflowCanvasNodeData } from "./workflowCanvasNodeData";
import { workflowCanvasEdgeTypes,workflowCanvasNodeTypes } from "./workflowCanvasFlowTypes";
import { useWorkflowCanvasVisibleNodeStatuses } from "./useWorkflowCanvasVisibleNodeStatuses";
import { WORKFLOW_CANVAS_EMBEDDED_STYLES } from "./workflowCanvasEmbeddedStyles";
import { WorkflowCanvasStructureSignature } from "./WorkflowCanvasStructureSignature";

export function WorkflowCanvas(args: {
  workflow: WorkflowDto;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
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
}) {
  const { workflow, nodeSnapshotsByNodeId, selectedNodeId, propertiesTargetNodeId, pinnedNodeIds = new Set<string>(), isLiveWorkflowView, isRunning, onSelectNode, onOpenPropertiesNode, onRunNode, onTogglePinnedOutput, onEditNodeOutput, onClearPinnedOutput } = args;
  const [hasMountedOnClient, setHasMountedOnClient] = useState(false);
  const [isInitialViewportReady, setIsInitialViewportReady] = useState(false);
  const workflowStructureSignature = useMemo(() => WorkflowCanvasStructureSignature.create(workflow), [workflow]);
  const visibleNodeStatusesByNodeId = useWorkflowCanvasVisibleNodeStatuses(nodeSnapshotsByNodeId);
  const { nodes, edges } = useMemo(
    () =>
      layoutWorkflow(
        workflow,
        nodeSnapshotsByNodeId,
        visibleNodeStatusesByNodeId,
        selectedNodeId,
        propertiesTargetNodeId,
        pinnedNodeIds,
        isLiveWorkflowView,
        isRunning,
        onSelectNode,
        onOpenPropertiesNode,
        onRunNode,
        onTogglePinnedOutput,
        onEditNodeOutput,
        onClearPinnedOutput,
      ),
    [isLiveWorkflowView, isRunning, nodeSnapshotsByNodeId, onClearPinnedOutput, onEditNodeOutput, onOpenPropertiesNode, onRunNode, onSelectNode, onTogglePinnedOutput, pinnedNodeIds, propertiesTargetNodeId, selectedNodeId, visibleNodeStatusesByNodeId, workflow],
  );
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<ReactFlowNode<WorkflowCanvasNodeData>, ReactFlowEdge> | null>(null);
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
      scheduleFitView();
    });
    resizeObserver.observe(canvasContainer);
    return () => {
      resizeObserver.disconnect();
    };
  }, [scheduleFitView]);

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
          nodeTypes={workflowCanvasNodeTypes}
          edgeTypes={workflowCanvasEdgeTypes}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance;
            scheduleFitView();
          }}
          onNodeClick={(_event, node) => onOpenPropertiesNode(node.id)}
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
          <Background gap={18} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      ) : null}
      <div
        aria-hidden={isInitialViewportReady}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          opacity: isInitialViewportReady ? 0 : 1,
          transition: "opacity 180ms ease-out",
          background:
            "linear-gradient(rgba(251,251,252,0.96), rgba(251,251,252,0.96)), radial-gradient(circle at center, rgba(15,23,42,0.04) 1px, transparent 1px)",
          backgroundSize: "auto, 18px 18px",
        }}
      >
        <div
          style={{
            minWidth: 220,
            padding: "16px 18px",
            border: "1px solid #e5e7eb",
            background: "rgba(255,255,255,0.94)",
            boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                background: "#2563eb",
                animation: "codemationCanvasLoaderPulse 1s ease-in-out infinite",
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: "#475569" }}>
              Workflow diagram
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Loading...</div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ height: 8, width: 176, background: "linear-gradient(90deg, #e5e7eb, #f8fafc, #e5e7eb)", backgroundSize: "200% 100%", animation: "codemationCanvasLoaderShimmer 1.4s linear infinite" }} />
            <div style={{ height: 8, width: 132, background: "linear-gradient(90deg, #e5e7eb, #f8fafc, #e5e7eb)", backgroundSize: "200% 100%", animation: "codemationCanvasLoaderShimmer 1.4s linear infinite" }} />
          </div>
        </div>
      </div>
      <style>{WORKFLOW_CANVAS_EMBEDDED_STYLES}</style>
    </div>
  );
}

export { VisibleNodeStatusResolver } from "./VisibleNodeStatusResolver";
export { WorkflowCanvasEdgeCountResolver } from "./WorkflowCanvasEdgeCountResolver";
export { WorkflowCanvasStructureSignature } from "./WorkflowCanvasStructureSignature";
