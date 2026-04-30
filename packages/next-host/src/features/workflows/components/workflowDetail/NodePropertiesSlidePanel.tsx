"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { cn } from "@/lib/utils";

import type {
  ConnectionInvocationRecord,
  NodeExecutionSnapshot,
  PersistedRunState,
} from "../../hooks/realtime/realtime";
import { useTelemetryRunTraceQuery } from "../../hooks/realtime/realtime";
import { NodeCredentialBindingsSection } from "./NodeCredentialBindingsSection";
import { NodePropertiesConfigSection } from "./NodePropertiesConfigSection";
import { NodePropertiesPanelHeader } from "./NodePropertiesPanelHeader";
import { WorkflowDetailPresenter } from "../../lib/workflowDetail/WorkflowDetailPresenter";
import type { WorkflowDiagramNode } from "../../lib/workflowDetail/workflowDetailTypes";

const PANEL_WIDTH_STORAGE_KEY = "codemation-node-properties-panel-width-px";
const DEFAULT_PANEL_WIDTH_PX = 300;
const MIN_PANEL_WIDTH_PX = 240;
const MAX_PANEL_WIDTH_PX = 560;

function loadStoredPanelWidthPx(): number {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_WIDTH_PX;
  }
  const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) {
    return DEFAULT_PANEL_WIDTH_PX;
  }
  return Math.min(MAX_PANEL_WIDTH_PX, Math.max(MIN_PANEL_WIDTH_PX, n));
}

/**
 * Overlays the canvas from the right (absolute) so the diagram does not reflow when opened/closed.
 */
export function NodePropertiesSlidePanel(
  args: Readonly<{
    workflowId: string;
    isOpen: boolean;
    node: WorkflowDiagramNode | undefined;
    telemetryRunId: string | null;
    telemetryRunStatus: PersistedRunState["status"] | undefined;
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
    onClose: () => void;
    pendingCredentialEditForNodeId: string | null;
    onConsumedPendingCredentialEdit: () => void;
    focusedInvocationId?: string | null;
    onSelectInvocation?: (invocationId: string) => void;
  }>,
) {
  const {
    isOpen,
    node,
    onClose,
    workflowId,
    telemetryRunId,
    telemetryRunStatus,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    pendingCredentialEditForNodeId,
    onConsumedPendingCredentialEdit,
    focusedInvocationId,
    onSelectInvocation,
  } = args;
  const isVisible = isOpen && Boolean(node);
  const telemetryRunTraceQuery = useTelemetryRunTraceQuery(telemetryRunId, {
    disableFetch: !isVisible,
    pollWhileNonTerminalMs: 2000,
    runStatus: telemetryRunStatus,
  });
  const [panelWidthPx, setPanelWidthPx] = useState(DEFAULT_PANEL_WIDTH_PX);
  const [isResizing, setIsResizing] = useState(false);
  const panelWidthRef = useRef(DEFAULT_PANEL_WIDTH_PX);
  const resizeStartClientXRef = useRef(0);
  const resizeStartWidthPxRef = useRef(DEFAULT_PANEL_WIDTH_PX);

  useEffect(() => {
    const loaded = loadStoredPanelWidthPx();
    setPanelWidthPx(loaded);
    panelWidthRef.current = loaded;
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidthPx;
  }, [panelWidthPx]);

  const handleResizeMouseDown = useCallback((event: ReactMouseEvent): void => {
    event.preventDefault();
    setIsResizing(true);
    resizeStartClientXRef.current = event.clientX;
    resizeStartWidthPxRef.current = panelWidthRef.current;
    const onMove = (moveEvent: MouseEvent): void => {
      const delta = resizeStartClientXRef.current - moveEvent.clientX;
      const next = Math.min(MAX_PANEL_WIDTH_PX, Math.max(MIN_PANEL_WIDTH_PX, resizeStartWidthPxRef.current + delta));
      panelWidthRef.current = next;
      setPanelWidthPx(next);
    };
    const onUp = (): void => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidthRef.current));
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <aside
      data-testid="node-properties-slide-panel"
      aria-hidden={!isVisible}
      className={cn(
        "absolute top-0 right-0 bottom-0 z-[8] flex flex-col overflow-hidden bg-card shadow-[-6px_0_18px_rgba(15,23,42,0.06)] transition-transform duration-200 ease-out",
        isVisible
          ? "translate-x-0 border-l border-border"
          : "pointer-events-none translate-x-full border-l border-transparent",
        isResizing && "select-none",
      )}
      style={{
        width: panelWidthPx,
      }}
    >
      {isVisible && node ? (
        <div data-testid="node-properties-panel" className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize properties panel"
            data-testid="node-properties-panel-resize-handle"
            className={cn("group absolute top-0 bottom-0 -left-1 z-[1] w-3 cursor-col-resize bg-transparent")}
            onMouseDown={handleResizeMouseDown}
          >
            <div
              data-testid="node-properties-panel-resize-handle-visual"
              className={cn(
                "pointer-events-none absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-transparent transition-colors duration-150 group-hover:bg-primary/40",
                isResizing && "bg-primary/50",
              )}
            />
          </div>
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col pl-1">
            <NodePropertiesPanelHeader
              title={WorkflowDetailPresenter.getNodeDisplayName(node, node.id)}
              subtitle={node.id}
              onClose={onClose}
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <NodePropertiesConfigSection
                node={node}
                telemetryRunId={telemetryRunId}
                nodeSnapshotsByNodeId={nodeSnapshotsByNodeId}
                connectionInvocations={connectionInvocations}
                telemetryRunTrace={telemetryRunTraceQuery.data}
                telemetryIsLoading={telemetryRunTraceQuery.isLoading}
                telemetryLoadError={
                  telemetryRunTraceQuery.error instanceof Error ? telemetryRunTraceQuery.error.message : null
                }
                focusedInvocationId={focusedInvocationId}
                onSelectInvocation={onSelectInvocation}
              />
              <NodeCredentialBindingsSection
                workflowId={workflowId}
                node={node}
                pendingCredentialEditForNodeId={pendingCredentialEditForNodeId}
                onConsumedPendingCredentialEdit={onConsumedPendingCredentialEdit}
              />
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
