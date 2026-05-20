"use client";
import { type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Manages fit-view scheduling for the workflow canvas.  Debounces
 * viewport-fit calls using double-rAF to let React Flow finish its internal
 * measurement before we request a fit, and re-fires via a 120 ms timeout to
 * catch async ELK-resolved node positions.
 */
export function useWorkflowCanvasFitView(args: {
  nodeCount: number;
  workflowId: string;
  workflowStructureSignature: string;
  setIsInitialViewportReady: (ready: boolean) => void;
  isInitialViewportReady: boolean;
}): {
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  reactFlowInstanceRef: React.RefObject<ReactFlowInstance<any, any> | null>; // eslint-disable-line @typescript-eslint/no-explicit-any
  scheduleFitView: () => void;
} {
  const { nodeCount, workflowId, workflowStructureSignature, setIsInitialViewportReady, isInitialViewportReady } = args;

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactFlowInstanceRef = useRef<ReactFlowInstance<any, any> | null>(null);
  const fitViewAnimationFrameIdRef = useRef<number | null>(null);
  const fitViewTimeoutIdRef = useRef<number | null>(null);
  const fitViewRequestIdRef = useRef(0);

  const fitViewOptions = useMemo(() => ({ padding: 0.24, minZoom: 0.2, maxZoom: 1 }) as const, []);

  const scheduleFitView = useCallback(() => {
    const canvasContainer = canvasContainerRef.current;
    const reactFlowInstance = reactFlowInstanceRef.current;
    if (!canvasContainer || !reactFlowInstance || nodeCount === 0) return;
    if (canvasContainer.clientWidth === 0 || canvasContainer.clientHeight === 0) return;
    if (fitViewAnimationFrameIdRef.current !== null) {
      cancelAnimationFrame(fitViewAnimationFrameIdRef.current);
    }
    fitViewRequestIdRef.current += 1;
    const requestId = fitViewRequestIdRef.current;
    fitViewAnimationFrameIdRef.current = requestAnimationFrame(() => {
      fitViewAnimationFrameIdRef.current = requestAnimationFrame(() => {
        fitViewAnimationFrameIdRef.current = null;
        void reactFlowInstance.fitView(fitViewOptions).then(() => {
          if (requestId !== fitViewRequestIdRef.current) return;
          setIsInitialViewportReady(true);
        });
      });
    });
  }, [fitViewOptions, nodeCount, setIsInitialViewportReady]);

  useEffect(() => {
    setIsInitialViewportReady(false);
  }, [workflowId, workflowStructureSignature, setIsInitialViewportReady]);

  useEffect(() => {
    scheduleFitView();
    if (fitViewTimeoutIdRef.current !== null) window.clearTimeout(fitViewTimeoutIdRef.current);
    fitViewTimeoutIdRef.current = window.setTimeout(() => {
      fitViewTimeoutIdRef.current = null;
      scheduleFitView();
    }, 120);
  }, [scheduleFitView, workflowId, workflowStructureSignature]);

  useEffect(() => {
    const canvasContainer = canvasContainerRef.current;
    if (!canvasContainer || typeof ResizeObserver === "undefined") return;
    const resizeObserver = new ResizeObserver(() => {
      if (isInitialViewportReady) return;
      scheduleFitView();
    });
    resizeObserver.observe(canvasContainer);
    return () => resizeObserver.disconnect();
  }, [isInitialViewportReady, scheduleFitView]);

  useEffect(() => {
    return () => {
      if (fitViewAnimationFrameIdRef.current !== null) cancelAnimationFrame(fitViewAnimationFrameIdRef.current);
      if (fitViewTimeoutIdRef.current !== null) window.clearTimeout(fitViewTimeoutIdRef.current);
    };
  }, []);

  return { canvasContainerRef, reactFlowInstanceRef, scheduleFitView };
}
