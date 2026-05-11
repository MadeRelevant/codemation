"use client";

import { useMemo, type CSSProperties } from "react";

import type { WorkflowCanvasConfig } from "../types/WorkflowCanvasConfig";

export function useWorkflowDetailScreenThemeStyle(config: WorkflowCanvasConfig | undefined): CSSProperties {
  return useMemo((): CSSProperties => {
    if (!config?.theme) return {};
    const t = config.theme;
    const vars: Record<string, string> = {};
    if (t.colorNodeBackground) vars["--canvas-node-bg"] = t.colorNodeBackground;
    if (t.colorNodeBorder) vars["--canvas-node-border"] = t.colorNodeBorder;
    if (t.colorNodeSelected) vars["--canvas-node-selected"] = t.colorNodeSelected;
    if (t.colorNodeRunning) vars["--canvas-node-running"] = t.colorNodeRunning;
    if (t.colorNodeQueued) vars["--canvas-node-queued"] = t.colorNodeQueued;
    if (t.colorEdge) vars["--canvas-edge"] = t.colorEdge;
    if (t.colorEdgeLabel) vars["--canvas-edge-label"] = t.colorEdgeLabel;
    if (t.colorCanvasBackground) vars["--canvas-bg"] = t.colorCanvasBackground;
    if (t.fontFamilyLabel) vars["--canvas-font-family-label"] = t.fontFamilyLabel;
    if (t.borderRadiusNode) vars["--canvas-border-radius-node"] = t.borderRadiusNode;
    return vars as CSSProperties;
  }, [config?.theme]);
}
