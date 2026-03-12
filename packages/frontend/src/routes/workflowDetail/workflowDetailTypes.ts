import type { ReactNode } from "react";
import type { FieldDataNode } from "rc-tree";
import type { Items, NodeExecutionSnapshot, PersistedRunState, RunSummary, WorkflowDto } from "../../realtime/realtime";

export type InspectorTab = "input" | "output";
export type InspectorMode = InspectorTab | "split";
export type InspectorFormat = "json" | "pretty";
export type CopyState = "idle" | "copied";
export type PortEntries = ReadonlyArray<readonly [string, Items]>;
export type WorkflowNode = WorkflowDto["nodes"][number];
export type ExecutionNode = Readonly<{ node: WorkflowNode; snapshot?: NodeExecutionSnapshot }>;
export type NodeExecutionError = NonNullable<NodeExecutionSnapshot["error"]>;
export type JsonEditorMode = "pin-input" | "debug-input" | "workflow-snapshot";
export type JsonEditorState = Readonly<{
  mode: JsonEditorMode;
  title: string;
  value: string;
}>;
export type ExecutionTreeNode = FieldDataNode<
  Readonly<{
    key: string;
    title?: ReactNode;
    workflowNode?: WorkflowNode;
    snapshot?: NodeExecutionSnapshot;
  }>
>;
export type WorkflowRunsSidebarSelectedRun = Pick<PersistedRunState, "workflowSnapshot" | "executionOptions"> | undefined;
export type WorkflowRunsSidebarRun = RunSummary;
export type WorkflowRunsSidebarModel = Readonly<{
  workflowId: string;
  displayedWorkflow: WorkflowDto | undefined;
  workflow: WorkflowDto | undefined;
  workflowError: string | null;
  error: string | null;
  displayedRuns: ReadonlyArray<RunSummary> | undefined;
  runsError: string | null;
  selectedRunId: string | null;
  selectedRun: PersistedRunState | undefined;
  isMutableSelectedRun: boolean;
  isRunning: boolean;
  selectedNodeId: string | null;
  selectedPinnedInput: unknown;
}>;
export type WorkflowRunsSidebarFormatting = Readonly<{
  formatDateTime: (value: string | undefined) => string;
  getExecutionModeLabel: (run: Pick<RunSummary, "executionOptions"> | Pick<PersistedRunState, "executionOptions"> | undefined) => string | null;
}>;
export type WorkflowRunsSidebarActions = Readonly<{
  onSelectRun: (runId: string) => void;
  onRun: () => void;
  onRunToHere: () => void;
  onDebugHere: () => void;
  onRunFromMutableExecution: () => void;
  onDebugMutableExecution: () => void;
  onPinInput: () => void;
  onClearPin: () => void;
  onEditWorkflowSnapshot: () => void;
}>;
export type WorkflowExecutionInspectorPaneModel = Readonly<{
  tab: InspectorTab;
  format: InspectorFormat;
  selectedPort: string | null;
  portEntries: PortEntries;
  value: unknown;
  emptyLabel: string;
  showsError: boolean;
}>;
export type WorkflowExecutionInspectorModel = Readonly<{
  selectedRunId: string | null;
  isLoading: boolean;
  loadError: string | null;
  selectedRun: PersistedRunState | undefined;
  selectedNodeId: string | null;
  selectedNodeSnapshot: NodeExecutionSnapshot | undefined;
  selectedWorkflowNode: WorkflowNode | undefined;
  selectedPinnedInput: Items | undefined;
  selectedNodeError: NodeExecutionError | undefined;
  selectedMode: InspectorMode;
  inputPane: WorkflowExecutionInspectorPaneModel;
  outputPane: WorkflowExecutionInspectorPaneModel;
  executionTreeData: ReadonlyArray<ExecutionTreeNode>;
  executionTreeExpandedKeys: ReadonlyArray<string>;
}>;
export type WorkflowExecutionInspectorFormatting = Readonly<{
  formatDateTime: (value: string | undefined) => string;
  getNodeDisplayName: (node: WorkflowNode | undefined, fallback: string | null) => string;
  getSnapshotTimestamp: (snapshot: NodeExecutionSnapshot | undefined) => string | undefined;
  getErrorHeadline: (error: NodeExecutionError | undefined) => string;
  getErrorStack: (error: NodeExecutionError | undefined) => string | null;
  getErrorClipboardText: (error: NodeExecutionError | undefined) => string;
}>;
export type WorkflowExecutionInspectorActions = Readonly<{
  onSelectNode: (nodeId: string) => void;
  onSelectMode: (mode: InspectorMode) => void;
  onSelectFormat: (tab: InspectorTab, format: InspectorFormat) => void;
  onSelectInputPort: (portName: string) => void;
  onSelectOutputPort: (portName: string) => void;
}>;
