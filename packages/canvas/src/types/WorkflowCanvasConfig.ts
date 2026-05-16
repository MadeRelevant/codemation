"use client";
import type { ComponentType, ReactNode } from "react";

import type { WorkflowCanvasNodeData } from "../canvas/lib/workflowCanvasNodeData";
import type { WorkflowCanvasTheme } from "./WorkflowCanvasTheme";
import type { JsonEditorState, PinBinaryMapsByItemIndex, WorkflowDiagramNode } from "../lib/workflowDetail/workflowDetailTypes";

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

/**
 * Props passed by the canvas to the consumer-provided credential bindings renderer.
 * Mirrors the arguments that NodeCredentialBindingsSection previously accepted directly.
 */
export type NodeCredentialBindingsSlotProps = Readonly<{
  workflowId: string;
  node: WorkflowDiagramNode;
  pendingCredentialEditForNodeId: string | null;
  onConsumedPendingCredentialEdit: () => void;
}>;

/**
 * Props passed to the `renderWorkflowJsonEditor` slot.
 */
export type WorkflowJsonEditorSlotProps = Readonly<{
  state: JsonEditorState;
  onClose: () => void;
  onSave: (value: string, binaryMaps?: PinBinaryMapsByItemIndex) => void;
  /** Initial tab when `state.mode === "pin-output"` (defaults to `json`). */
  defaultInitialTab?: "json" | "binaries";
}>;

export type WorkflowCanvasConfig = Readonly<{
  nodeRoleFilter?: (role: string, nodeKind: string) => boolean;
  renderers?: WorkflowCanvasRenderers;
  edgeTypes?: Record<string, ComponentType<Record<string, unknown>>>;
  iconRegistries?: ReadonlyArray<WorkflowCanvasIconRegistry>;
  theme?: Partial<WorkflowCanvasTheme>;
  readOnly?: boolean;
  /**
   * Renders the credential-bindings UI for a selected node's inspector panel.
   * Consumers MUST provide an implementation appropriate for their environment:
   * - next-host: renders the existing dropdown + create/edit dialogs
   * - control-plane: renders a Connect-via-broker button for OAuth providers
   *
   * If omitted, a small "Credential UI not configured" notice is shown.
   */
  renderCredentialBindings?: (props: NodeCredentialBindingsSlotProps) => ReactNode;
  /**
   * Overrides the built-in workflow JSON editor dialog.
   * When omitted, canvas renders `WorkflowJsonEditorDialog` (the default).
   * Consumers who need a custom editor surface (e.g. different shell or styling)
   * can provide their own dialog here.
   */
  renderWorkflowJsonEditor?: (props: WorkflowJsonEditorSlotProps) => ReactNode;
}>;
