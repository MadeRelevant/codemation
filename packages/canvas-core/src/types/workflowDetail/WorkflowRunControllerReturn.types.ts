import type {
  NodeExecutionSnapshot,
  PersistedRunState,
  RunCurrentState,
  WorkflowDevBuildState,
  WorkflowDto,
} from "../../realtime/realtimeDomainTypes";
import type {
  ViewedWorkflowContext,
  WorkflowRunsSidebarActions,
  WorkflowRunsSidebarFormatting,
  WorkflowRunsSidebarModel,
} from "../../lib/workflowDetail/workflowDetailTypes";
import type { RunWorkflowRequest } from "../WorkflowCanvasApiClient";
import type { WorkflowRunInternalError } from "../WorkflowCanvasConfig";

/**
 * Shared state that the run controller exposes for peer sub-controllers to READ via props.
 * The façade threads these as props into inspect / pin / json-edit controllers.
 */
export type WorkflowRunControllerSharedState = Readonly<{
  /** Current viewed context: live workflow or a historical run. */
  viewContext: ViewedWorkflowContext;
  /**
   * Active execution state for the current view context.
   * Live-workflow: overlay; historical-run: selected run persisted state.
   */
  currentExecutionState: RunCurrentState | PersistedRunState | undefined;
  /** The live workflow definition (not the viewed snapshot). */
  workflow: WorkflowDto | undefined;
  /**
   * Start a manual workflow run. Exposed so test-suite sub-controller can
   * trigger runs without coupling into run's internals.
   */
  startRun: (request?: RunWorkflowRequest) => void;
  /**
   * Start a run stopping at a specific node. Exposed so inspect sub-controller
   * can trigger per-node runs without coupling into run's internals.
   */
  startRunForNode: (nodeId: string) => void;
  /**
   * Replace the debugger overlay's current state and sync the React Query cache.
   * Exposed so pin sub-controller can apply pin changes without owning the API call.
   */
  replaceDebuggerOverlay: (nextCurrentState: RunCurrentState) => Promise<void>;
  /**
   * Persist a workflow-snapshot edit from the JSON editor dialog.
   * Exposed so the façade can route saveJsonEditor in workflow-snapshot mode here.
   * Returns a promise that resolves when the snapshot update is persisted.
   */
  persistWorkflowSnapshotUpdate: (runId: string, value: string) => Promise<void>;
}>;

export type WorkflowRunControllerReturn = WorkflowRunControllerSharedState &
  Readonly<{
    displayedWorkflow: WorkflowDto | undefined;
    /** Nodes on the canvas that have a required credential slot with status unbound. */
    credentialAttentionNodeIds: ReadonlySet<string>;
    /** Lines for workflow-level credential attention tooltip (node label · slot label). */
    credentialAttentionSummaryLines: ReadonlyArray<string>;
    /** Per-canvas-node tooltip lines for unbound required credential slots. */
    credentialAttentionTooltipByNodeId: ReadonlyMap<string, string>;
    /** Nodes that have at least one bound credential instance (canvas toolbar can open edit). */
    workflowNodeIdsWithBoundCredential: ReadonlySet<string>;
    displayedNodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
    displayedConnectionInvocations: ReadonlyArray<NonNullable<PersistedRunState["connectionInvocations"]>[number]>;
    pinnedNodeIds: ReadonlySet<string>;
    isLiveWorkflowView: boolean;
    isRunsPaneVisible: boolean;
    isRunning: boolean;
    workflowDevBuildState: WorkflowDevBuildState;
    showRealtimeDisconnectedBadge: boolean;
    canCopySelectedRunToLive: boolean;
    selectedRun: PersistedRunState | undefined;
    propertiesPanelTelemetryRunId: string | null;
    propertiesPanelTelemetryRunStatus: PersistedRunState["status"] | undefined;
    sidebarModel: WorkflowRunsSidebarModel;
    sidebarFormatting: WorkflowRunsSidebarFormatting;
    sidebarActions: WorkflowRunsSidebarActions;
    runWorkflowFromCanvas: () => void;
    openLiveWorkflow: () => void;
    openExecutionsPane: () => void;
    copySelectedRunToLive: () => void;
    workflowIsActive: boolean;
    isWorkflowActivationPending: boolean;
    workflowActivationAlertLines: ReadonlyArray<string> | null;
    dismissWorkflowActivationAlert: () => void;
    setWorkflowActive: (active: boolean) => void;
    runErrorAlertLines: ReadonlyArray<string> | null;
    dismissRunErrorAlert: () => void;
    runInternalError: WorkflowRunInternalError | null;
    dismissRunInternalError: () => void;
  }>;
