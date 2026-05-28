import type { WorkflowRunControllerReturn } from "./WorkflowRunControllerReturn.types";
import type { WorkflowInspectControllerReturn } from "./WorkflowInspectControllerReturn.types";
import type { WorkflowJsonEditControllerReturn } from "./WorkflowJsonEditControllerReturn.types";
import type { UseWorkflowCanvasRunButtonResult } from "../../hooks/useWorkflowCanvasRunButton";

/**
 * Context passed to `renderHeader`. Exposes workflow identity and lifecycle status.
 */
export type WorkflowDetailHeaderSlotContext = Readonly<{
  workflowId: string;
  workflowName: string | undefined;
  isRunning: WorkflowRunControllerReturn["isRunning"];
  isLiveWorkflowView: WorkflowRunControllerReturn["isLiveWorkflowView"];
}>;

/**
 * Context passed to `renderTabs`. Exposes the current active tab and its setter.
 */
export type WorkflowDetailTabsSlotContext = Readonly<{
  activeCanvasTab: "live" | "executions" | "tests";
  onSelectLive: WorkflowRunControllerReturn["openLiveWorkflow"];
  onSelectExecutions: WorkflowRunControllerReturn["openExecutionsPane"];
  onSelectTests: () => void;
}>;

/**
 * Subset of the inspect sub-controller that `WorkflowDetailScreenInspectorPanel` reads.
 * Exposed via `renderInspector` ctx so custom inspector implementations have what they need
 * without requiring internal sub-controller methods that the facade does not surface.
 */
export type InspectorSlotInspect = Pick<
  WorkflowInspectControllerReturn,
  | "isPanelCollapsed"
  | "inspectorHeight"
  | "startInspectorResize"
  | "toggleInspectorPanel"
  | "inspectorModel"
  | "inspectorFormatting"
  | "inspectorActions"
  | "selectedNodeId"
  | "selectedCanvasNodeId"
  | "propertiesPanelNodeId"
  | "isPropertiesPanelOpen"
>;

/**
 * Minimal pin surface exposed to `renderInspector` consumers.
 * The full `WorkflowPinControllerReturn` is not available via the facade; this exposes
 * the composed canvas-level pin actions that the facade surfaces directly.
 */
export type InspectorSlotPin = Readonly<{
  pinnedNodeIds: WorkflowRunControllerReturn["pinnedNodeIds"];
  togglePin: (nodeId: string) => void;
  editOutput: (nodeId: string) => void;
  clearPin: (nodeId: string) => void;
}>;

/**
 * Context passed to `renderInspector`. Exposes the sub-controller state that drives the
 * inspector panel today: { inspect, pin, jsonEdit }.
 */
export type WorkflowDetailInspectorSlotContext = Readonly<{
  inspect: InspectorSlotInspect;
  pin: InspectorSlotPin;
  jsonEdit: Pick<WorkflowJsonEditControllerReturn, "jsonEditorState" | "closeJsonEditor" | "saveJsonEditor">;
}>;

/**
 * Context passed to `renderRunButton`. Exposes the run sub-controller result
 * for trigger picker / start state.
 */
export type WorkflowDetailRunButtonSlotContext = Readonly<{
  run: UseWorkflowCanvasRunButtonResult;
}>;
