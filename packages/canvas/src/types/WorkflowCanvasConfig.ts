"use client";
import type { ComponentType } from "react";

import type { WorkflowCanvasNodeData } from "../canvas/lib/workflowCanvasNodeData";
import type { WorkflowCanvasTheme } from "./WorkflowCanvasTheme";

export type { WorkflowCanvasNodeData };

export type WorkflowCanvasIconRegistry = Readonly<{
  resolveIcon: (icon: string) => ComponentType | null;
}>;

export type WorkflowCanvasNodeRendererProps = Readonly<{
  data: WorkflowCanvasNodeData;
}>;

export type WorkflowCanvasRenderers = Readonly<{
  node?: ComponentType<WorkflowCanvasNodeRendererProps>;
  nodeToolbar?: ComponentType<Record<string, unknown>>;
  nodeGlyph?: ComponentType<Record<string, unknown>>;
  nodeLabels?: ComponentType<Record<string, unknown>>;
}>;

export type WorkflowCanvasConfig = Readonly<{
  nodeRoleFilter?: (role: string, nodeKind: string) => boolean;
  renderers?: WorkflowCanvasRenderers;
  edgeTypes?: Record<string, ComponentType<Record<string, unknown>>>;
  iconRegistries?: ReadonlyArray<WorkflowCanvasIconRegistry>;
  theme?: Partial<WorkflowCanvasTheme>;
  readOnly?: boolean;
}>;
