import type { BinaryAttachment } from "@codemation/core/browser";
import type { FieldDataNode } from "rc-tree";
import type { ReactNode } from "react";
import type {
  Items,
  NodeExecutionSnapshot,
  PersistedRunState,
  RunSummary,
  WorkflowRunDetailDto,
  WorkflowDto,
} from "../../hooks/realtime/realtime";

export type InspectorTab = "input" | "output";
export type InspectorMode = InspectorTab | "split";
export type InspectorFormat = "json" | "pretty" | "binary";
export type CopyState = "idle" | "copied";
export type ViewedWorkflowContext = "live-workflow" | "historical-run";
export type PortEntries = ReadonlyArray<readonly [string, Items]>;
export type WorkflowNode = WorkflowDto["nodes"][number];
export type WorkflowDiagramNode = WorkflowDto["nodes"][number];
export type ExecutionNode = Readonly<{
  node: WorkflowNode;
  snapshot?: NodeExecutionSnapshot;
  executionInstanceId?: string;
  slotNodeId?: string;
  parentExecutionInstanceId?: string;
  /** Stable workflow attachment id when `node.id` is a synthetic per-invocation id. */
  workflowConnectionNodeId?: string;
}>;
export type NodeExecutionError = NonNullable<NodeExecutionSnapshot["error"]>;
export type JsonEditorMode = "pin-output" | "workflow-snapshot";
/** Per-output-item binary maps for the pin-output dialog (parallel to parsed JSON items). */
export type PinBinaryMapsByItemIndex = ReadonlyArray<Readonly<Record<string, BinaryAttachment>>>;
export type JsonEditorState = Readonly<
  | {
      mode: "workflow-snapshot";
      title: string;
      value: string;
    }
  | {
      mode: "pin-output";
      title: string;
      value: string;
      workflowId: string;
      nodeId: string;
      outputPort: string;
      binaryMapsByItemIndex: PinBinaryMapsByItemIndex;
    }
>;
export type ExecutionTreeNode = FieldDataNode<
  Readonly<{
    key: string;
    title?: ReactNode;
    workflowNode?: WorkflowNode;
    snapshot?: NodeExecutionSnapshot;
  }>
>;
export type WorkflowRunsSidebarSelectedRun =
  | Pick<PersistedRunState, "workflowSnapshot" | "executionOptions">
  | undefined;
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
}>;
export type WorkflowRunsSidebarFormatting = Readonly<{
  formatDateTime: (value: string | undefined) => string;
  formatRunListWhen: (value: string | undefined) => string;
  formatRunListDurationLine: (run: Pick<RunSummary, "startedAt" | "finishedAt" | "status">) => string;
  getExecutionModeLabel: (
    run: Pick<RunSummary, "executionOptions"> | Pick<PersistedRunState, "executionOptions"> | undefined,
  ) => string | null;
}>;
export type WorkflowRunsSidebarActions = Readonly<{
  onSelectRun: (runId: string) => void;
}>;
export type WorkflowExecutionInspectorNodeActionsModel = Readonly<{
  viewContext: ViewedWorkflowContext;
  isRunning: boolean;
  canEditOutput: boolean;
  canClearPinnedOutput: boolean;
}>;
export type WorkflowExecutionInspectorPaneModel = Readonly<{
  tab: InspectorTab;
  format: InspectorFormat;
  selectedPort: string | null;
  portEntries: PortEntries;
  value: unknown;
  attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel>;
  emptyLabel: string;
  showsError: boolean;
}>;
export type WorkflowExecutionInspectorAttachmentModel = Readonly<{
  key: string;
  itemIndex: number;
  name: string;
  contentUrl: string;
  attachment: BinaryAttachment;
}>;
export type PrettyJsonTreeNode = Readonly<{
  key: string;
  label: string;
  isLeaf: boolean;
  inlineValue?: ReactNode;
  multilineValue?: string;
  children?: ReadonlyArray<PrettyJsonTreeNode>;
}>;
export type WorkflowInspectorAttachmentGroup = Readonly<{
  itemIndex: number;
  attachments: ReadonlyArray<WorkflowExecutionInspectorAttachmentModel>;
}>;
export type WorkflowExecutionInspectorModel = Readonly<{
  workflowId: string;
  viewContext: ViewedWorkflowContext;
  selectedRunId: string | null;
  isLoading: boolean;
  loadError: string | null;
  selectedRun: PersistedRunState | undefined;
  selectedRunDetail: WorkflowRunDetailDto | undefined;
  selectedNodeId: string | null;
  /** When the selection is a connection invocation row, this matches {@link ConnectionInvocationRecord#invocationId}. */
  selectedExecutionInstanceId: string | null;
  selectedNodeSnapshot: NodeExecutionSnapshot | undefined;
  selectedWorkflowNode: WorkflowNode | undefined;
  selectedPinnedOutput: Items | undefined;
  selectedNodeError: NodeExecutionError | undefined;
  selectedMode: InspectorMode;
  inputPane: WorkflowExecutionInspectorPaneModel;
  outputPane: WorkflowExecutionInspectorPaneModel;
  executionTreeData: ReadonlyArray<ExecutionTreeNode>;
  executionTreeExpandedKeys: ReadonlyArray<string>;
  /** rc-tree key for the selected execution row (may differ from {@link selectedNodeId} when keys are disambiguated). */
  selectedExecutionTreeKey: string | null;
  nodeActions: WorkflowExecutionInspectorNodeActionsModel;
}>;
export type WorkflowExecutionInspectorFormatting = Readonly<{
  formatDateTime: (value: string | undefined) => string;
  formatDurationLabel: (snapshot: NodeExecutionSnapshot | undefined) => string | null;
  getNodeDisplayName: (node: WorkflowNode | undefined, fallback: string | null) => string;
  getSnapshotTimestamp: (snapshot: NodeExecutionSnapshot | undefined) => string | undefined;
  getErrorHeadline: (error: NodeExecutionError | undefined) => string;
  getErrorStack: (error: NodeExecutionError | undefined) => string | null;
  getErrorClipboardText: (error: NodeExecutionError | undefined) => string;
}>;
export type WorkflowExecutionInspectorActions = Readonly<{
  onSelectNode: (nodeId: string) => void;
  onEditSelectedOutput: () => void;
  onClearPinnedOutput: () => void;
  onSelectMode: (mode: InspectorMode) => void;
  onSelectFormat: (tab: InspectorTab, format: InspectorFormat) => void;
  onSelectInputPort: (portName: string) => void;
  onSelectOutputPort: (portName: string) => void;
}>;
