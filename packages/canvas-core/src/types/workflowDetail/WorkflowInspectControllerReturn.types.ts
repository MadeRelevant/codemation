import type { WorkflowDto } from "../../realtime/realtimeDomainTypes";
import type {
  WorkflowExecutionInspectorActions,
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
} from "../../lib/workflowDetail/workflowDetailTypes";

export type WorkflowInspectControllerReturn = Readonly<{
  /** The node id that drives the inspector panel (tree selection, telemetry, etc.). */
  selectedNodeId: string | null;
  /** The node id of the currently selected canvas node (may differ for connection invocations). */
  selectedCanvasNodeId: string | null;
  /** The node id that drives the properties side-panel. */
  propertiesPanelNodeId: string | null;
  isPropertiesPanelOpen: boolean;
  /** The full workflow node for the properties side-panel (from displayedWorkflow). */
  selectedPropertiesWorkflowNode: WorkflowDto["nodes"][number] | undefined;
  /** Selects a canvas node and updates inspector + URL. */
  selectCanvasNode: (nodeId: string) => void;
  /**
   * Selects a node and output port (used by the façade to compose pin actions).
   * Sets the inspector node, marks manual selection, and navigates the URL.
   */
  selectNodeAndOutputPort: (nodeId: string, outputPort: string) => void;
  /**
   * Selects a node for a per-node run (used by the façade to compose runCanvasNode).
   * Sets manual selection, updates selectedNodeId, navigates URL.
   */
  selectNodeForRun: (nodeId: string) => void;
  /** Opens the properties side-panel for a node without changing inspector selection. */
  openPropertiesPanelForNode: (nodeId: string) => void;
  /** Opens the properties panel and arms a credential edit request for the node. */
  requestOpenCredentialEditForNode: (nodeId: string) => void;
  /** Consumes the pending credential edit request (called after the dialog opens). */
  consumePendingCredentialEditRequest: () => void;
  /** Closes the properties side-panel. */
  closePropertiesPanel: () => void;
  /** Selects an invocation row in the properties panel (updates inspector selection). */
  selectInvocationInPropertiesPanel: (invocationId: string) => void;
  pendingCredentialEditForNodeId: string | null;
  /** The connection invocation id focused in the properties panel, or null. */
  focusedInvocationIdInPropertiesPanel: string | null;
  /**
   * The currently selected output port in the inspector.
   * Exposed for the façade to compose pin actions (e.g. clear pinned output for selected port).
   */
  selectedOutputPort: string | null;
  /** Inspector bottom-panel collapsed state. */
  isPanelCollapsed: boolean;
  /** Inspector bottom-panel height in px. */
  inspectorHeight: number;
  /** Begin a drag-resize of the inspector panel. */
  startInspectorResize: (clientY: number) => void;
  /** Toggle the inspector panel collapsed/expanded. */
  toggleInspectorPanel: () => void;
  inspectorModel: WorkflowExecutionInspectorModel;
  inspectorFormatting: WorkflowExecutionInspectorFormatting;
  inspectorActions: WorkflowExecutionInspectorActions;
}>;
