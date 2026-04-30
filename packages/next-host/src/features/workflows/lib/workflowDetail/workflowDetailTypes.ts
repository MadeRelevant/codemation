import type { BinaryAttachment } from "@codemation/core/browser";
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
  /**
   * Specific invocation row id this execution node nests under. Set for connection invocations
   * whose parent agent is itself a tool-call invocation row (e.g. a sub-agent's LLM/tool
   * invocations should appear under the orchestrator's specific tool-call row that triggered
   * them, not under the static tool-connection node id which would collapse all sibling rows).
   */
  parentInvocationId?: string;
  /** Stable workflow node id used to sync inspector selection to the canvas. */
  workflowNodeId?: string;
  /** Stable workflow attachment id when `node.id` is a synthetic per-invocation id. */
  workflowConnectionNodeId?: string;
  /**
   * Per-item identity carried by connection-invocation rows. Used by the inspector tree to
   * group multiple invocations of the same agent activation under a synthetic "Item N" parent
   * row when an agent emits 2+ items, so the tree shows items as siblings (with each item's
   * LLM/tool calls nested) instead of one flat list.
   */
  iterationId?: string;
  /** 0-based item index from the engine's per-item loop; used to sort items deterministically. */
  itemIndex?: number;
  /** Set on synthetic "Item N" rows so the renderer can pick a different glyph and label. */
  isItemGroup?: boolean;
  /** Parent agent's activation id for invocation rows (used to scope synthetic Item parents). */
  parentAgentActivationId?: string;
  /** Parent agent's node id for invocation rows (used to scope synthetic Item parents). */
  parentAgentNodeId?: string;
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
export type ExecutionTreeNode = Readonly<{
  key: string;
  title?: ReactNode;
  workflowNode?: WorkflowNode;
  snapshot?: NodeExecutionSnapshot;
  inspectorNodeId: string;
  canvasNodeId: string | null;
  children: ReadonlyArray<ExecutionTreeNode>;
  isLeaf: boolean;
}>;
export type ExecutionTreeItemData = Readonly<{
  key: string;
  title?: ReactNode;
  workflowNode?: WorkflowNode;
  snapshot?: NodeExecutionSnapshot;
  childKeys: ReadonlyArray<string>;
  inspectorNodeId: string;
  canvasNodeId: string | null;
}>;
export type WorkflowExecutionInspectorTreeSelection = Readonly<{
  inspectorNodeId: string;
  canvasNodeId: string | null;
}>;
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
  /** Stable rendered tree key for the selected execution row (may differ from {@link selectedNodeId} when keys are disambiguated). */
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
  onSelectNode: (selection: WorkflowExecutionInspectorTreeSelection) => void;
  onEditSelectedOutput: () => void;
  onClearPinnedOutput: () => void;
  onSelectMode: (mode: InspectorMode) => void;
  onSelectFormat: (tab: InspectorTab, format: InspectorFormat) => void;
  onSelectInputPort: (portName: string) => void;
  onSelectOutputPort: (portName: string) => void;
}>;
