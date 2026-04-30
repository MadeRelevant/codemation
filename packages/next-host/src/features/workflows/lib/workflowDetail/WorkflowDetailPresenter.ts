import { ItemsInputNormalizer, RunFinishedAtFactory } from "@codemation/core/browser";
import type { WorkflowCredentialHealthSlotDto } from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { codemationApiClient } from "../../../../api/CodemationApiClient";
import { format, isToday, isYesterday } from "date-fns";
import prettyMilliseconds from "pretty-ms";
import { HumanFriendlyTimestampFormatter } from "../../../lib/HumanFriendlyTimestampFormatter";
import type {
  ConnectionInvocationRecord,
  ExecutionInstanceDto,
  Items,
  NodeExecutionSnapshot,
  PersistedRunState,
  PersistedWorkflowSnapshot,
  RunCurrentState,
  RunSummary,
  WorkflowRunDetailDto,
  WorkflowDebuggerOverlayState,
  WorkflowDto,
} from "../../hooks/realtime/realtime";
import { ExecutionTreeItemGroupInjector } from "./ExecutionTreeItemGroupInjector";
import { PersistedWorkflowSnapshotMapper } from "./PersistedWorkflowSnapshotMapper";
import { WorkflowExecutionTreeBuilder } from "./WorkflowExecutionTreeBuilder";
import type { BinaryAttachment } from "@codemation/core/browser";
import type {
  ExecutionNode,
  ExecutionTreeNode,
  InspectorMode,
  NodeExecutionError,
  PinBinaryMapsByItemIndex,
  PortEntries,
  ViewedWorkflowContext,
  WorkflowExecutionInspectorAttachmentModel,
  WorkflowNode,
} from "./workflowDetailTypes";

export type RunWorkflowResult = Readonly<{
  runId: string;
  workflowId: string;
  status: string;
  startedAt?: string;
  state: PersistedRunState | null;
}>;
export type RunWorkflowMode = "manual" | "debug";
export type RunWorkflowRequest = Readonly<{
  items?: Items;
  currentState?: RunCurrentState;
  startAt?: string;
  stopAt?: string;
  clearFromNodeId?: string;
  mode?: RunWorkflowMode;
  sourceRunId?: string;
}>;

type InspectableExecutionState = Readonly<{
  mutableState?: PersistedRunState["mutableState"];
  nodeSnapshotsByNodeId: PersistedRunState["nodeSnapshotsByNodeId"];
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
}>;

export class WorkflowDetailPresenter {
  private static readonly persistedWorkflowDtoMapper = new PersistedWorkflowSnapshotMapper();
  private static readonly itemsInputNormalizer = new ItemsInputNormalizer();
  private static readonly visibleExecutionStatuses = new Set<NodeExecutionSnapshot["status"]>([
    "queued",
    "running",
    "completed",
    "failed",
  ]);

  static async runWorkflow(
    workflowId: string,
    workflow: WorkflowDto | undefined,
    request: RunWorkflowRequest = {},
  ): Promise<RunWorkflowResult> {
    const shouldSynthesizeTriggerItems = this.shouldSynthesizeTriggerItems(workflow, request);
    const items = request.items ?? (shouldSynthesizeTriggerItems ? undefined : this.createRunItems(workflow));
    return await codemationApiClient.postJson<RunWorkflowResult>(ApiPaths.runs(), {
      workflowId,
      items,
      synthesizeTriggerItems: shouldSynthesizeTriggerItems,
      currentState: request.currentState,
      startAt: request.startAt,
      stopAt: request.stopAt,
      clearFromNodeId: request.clearFromNodeId,
      mode: request.mode,
      sourceRunId: request.sourceRunId,
    });
  }

  static createOptimisticTriggerFetchSnapshot(
    workflowId: string,
    workflow: WorkflowDto | undefined,
    request: RunWorkflowRequest,
  ): NodeExecutionSnapshot | undefined {
    const triggerNodeId = this.resolveTriggerTestNodeId(workflow, request);
    if (!triggerNodeId) {
      return undefined;
    }
    const updatedAt = new Date().toISOString();
    return {
      runId: `optimistic_trigger_fetch:${workflowId}:${triggerNodeId}`,
      workflowId,
      nodeId: triggerNodeId,
      status: "running",
      startedAt: updatedAt,
      updatedAt,
      inputsByPort: {},
    };
  }

  static async runNode(
    runId: string,
    nodeId: string,
    items: Items | undefined,
    mode?: RunWorkflowMode,
    synthesizeTriggerItems?: boolean,
  ): Promise<RunWorkflowResult> {
    return await codemationApiClient.postJson<RunWorkflowResult>(ApiPaths.runNode(runId, nodeId), {
      items,
      mode,
      synthesizeTriggerItems,
    });
  }

  static async updatePinnedInput(runId: string, nodeId: string, items: Items | undefined): Promise<PersistedRunState> {
    return await codemationApiClient.patchJson<PersistedRunState>(ApiPaths.runNodePin(runId, nodeId), { items });
  }

  static async updateWorkflowSnapshot(
    runId: string,
    workflowSnapshot: PersistedWorkflowSnapshot,
  ): Promise<PersistedRunState> {
    return await codemationApiClient.patchJson<PersistedRunState>(ApiPaths.runWorkflowSnapshot(runId), {
      workflowSnapshot,
    });
  }

  static createRunItems(workflow: WorkflowDto | undefined): Items {
    if (this.isTriggerStartedWorkflow(workflow)) {
      return [];
    }
    return [{ json: {} }];
  }

  static formatDateTime(value: string | undefined): string {
    if (!value) return "Pending";
    const date = new Date(value);
    const time = format(date, "HH:mm:ss");
    if (isToday(date)) return `Today ${time}`;
    if (isYesterday(date)) return `Yesterday ${time}`;
    return format(date, "d MMM yyyy HH:mm:ss");
  }

  /** Primary label for run list rows: clearer date + time than {@link formatDateTime}. */
  static formatRunListWhen(value: string | undefined): string {
    return HumanFriendlyTimestampFormatter.formatRunListWhen(value);
  }

  static formatRunListDurationLine(run: Pick<RunSummary, "startedAt" | "finishedAt" | "status">): string {
    if (run.status === "running") return "Still running…";
    if (run.status === "pending") return "Waiting…";
    if (!run.startedAt) return "";
    const startMs = new Date(run.startedAt).getTime();
    if (Number.isNaN(startMs)) return "";
    if (run.finishedAt) {
      const endMs = new Date(run.finishedAt).getTime();
      if (!Number.isNaN(endMs)) {
        return prettyMilliseconds(Math.max(0, endMs - startMs), { compact: true });
      }
    }
    return "—";
  }

  static getNodeDisplayName(node: WorkflowNode | undefined, fallback: string | null): string {
    return node?.name ?? node?.type ?? fallback ?? "Unknown node";
  }

  static getSnapshotTimestamp(snapshot: NodeExecutionSnapshot | undefined): string | undefined {
    return snapshot?.finishedAt ?? snapshot?.updatedAt ?? snapshot?.startedAt ?? snapshot?.queuedAt;
  }

  static formatDurationLabel(snapshot: NodeExecutionSnapshot | undefined): string | null {
    const durationMs = WorkflowDetailPresenter.getSnapshotDurationMs(snapshot);
    if (durationMs === null) {
      return null;
    }
    return `Took ${prettyMilliseconds(durationMs, { unitCount: 3, separateMilliseconds: true })}`;
  }

  static getDefaultInspectorMode(_snapshot: NodeExecutionSnapshot | undefined): InspectorMode {
    return "output";
  }

  static getPreferredWorkflowNodeId(workflow: WorkflowDto | undefined): string | null {
    if (!workflow) {
      return null;
    }
    return (
      workflow.nodes.find((node) => node.role === "agent")?.id ??
      workflow.nodes.find((node) => node.kind !== "trigger")?.id ??
      workflow.nodes[0]?.id ??
      null
    );
  }

  static inspectorSelectionAnchorsDisplayedWorkflow(
    nodeId: string | null,
    workflow: WorkflowDto | undefined,
    connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>,
  ): boolean {
    if (!nodeId || !workflow?.nodes.length) {
      return false;
    }
    if (workflow.nodes.some((n) => n.id === nodeId)) {
      return true;
    }
    return Boolean(connectionInvocations?.some((inv) => inv.invocationId === nodeId));
  }

  /**
   * Maps inspector selection id (workflow node id or LLM/tool {@link ConnectionInvocationRecord#invocationId})
   * to the workflow node id used for canvas chrome (selection ring, properties panel workflow lookup).
   */
  static resolveCanvasWorkflowNodeIdForHighlight(
    selectedId: string | null,
    workflow: WorkflowDto | undefined,
    connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>,
  ): string | null {
    if (!selectedId || !workflow?.nodes.length) {
      return null;
    }
    if (workflow.nodes.some((n) => n.id === selectedId)) {
      return selectedId;
    }
    const inv = connectionInvocations?.find((i) => i.invocationId === selectedId);
    return inv?.connectionNodeId ?? null;
  }

  static resolveInspectorNodeIdForCanvasPick(
    canvasWorkflowNodeId: string,
    workflow: WorkflowDto | undefined,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>> | undefined,
    connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>,
    executionDetail?: WorkflowRunDetailDto,
  ): string {
    const historicalSelection = this.resolveHistoricalInspectorNodeIdForCanvasPick(
      canvasWorkflowNodeId,
      executionDetail,
    );
    if (historicalSelection) {
      return historicalSelection;
    }
    const wfNode = workflow?.nodes.find((n) => n.id === canvasWorkflowNodeId);
    if (!wfNode) {
      return canvasWorkflowNodeId;
    }
    const invocationsForEdge = (connectionInvocations ?? []).filter(
      (inv) => inv.connectionNodeId === canvasWorkflowNodeId,
    );
    if (invocationsForEdge.length > 0) {
      const ordered = [...invocationsForEdge].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return ordered[0]!.invocationId;
    }
    const snapshots = Object.values(nodeSnapshotsByNodeId ?? {}).filter((snapshot) =>
      this.visibleExecutionStatuses.has(snapshot.status),
    );
    const matching = snapshots.filter((snapshot) => {
      if (wfNode.role === "languageModel") {
        return snapshot.nodeId === canvasWorkflowNodeId;
      }
      if (wfNode.role === "tool" || wfNode.role === "nestedAgent") {
        return snapshot.nodeId === canvasWorkflowNodeId;
      }
      return snapshot.nodeId === canvasWorkflowNodeId;
    });
    if (matching.length === 0) {
      return canvasWorkflowNodeId;
    }
    matching.sort((left, right) => {
      const leftTs = this.getSnapshotTimestamp(left) ?? "";
      const rightTs = this.getSnapshotTimestamp(right) ?? "";
      return rightTs.localeCompare(leftTs);
    });
    return matching[0]!.nodeId;
  }

  static sortPortEntries(value: Readonly<Record<string, Items>> | undefined): PortEntries {
    return Object.entries(value ?? {}).sort(([left], [right]) => {
      if (left === right) return 0;
      if (left === "main") return -1;
      if (right === "main") return 1;
      return left.localeCompare(right);
    });
  }

  static resolveSelectedPort(entries: PortEntries, current: string | null): string | null {
    if (entries.length === 0) return null;
    if (current && entries.some(([portName]) => portName === current)) return current;
    return entries.find(([, items]) => items.length > 0)?.[0] ?? entries[0]![0];
  }

  static applyPinnedOutputsToPortEntries(
    entries: PortEntries,
    pinnedOutputsByPort: Readonly<Record<string, Items>> | undefined,
  ): PortEntries {
    if (!pinnedOutputsByPort) {
      return entries;
    }
    return this.sortPortEntries({
      ...Object.fromEntries(entries),
      ...pinnedOutputsByPort,
    });
  }

  static toJsonValue(items: Items | undefined): unknown {
    if (!items || items.length === 0) return undefined;
    const jsonValues = items.map((item) => item.json);
    return jsonValues.length === 1 ? jsonValues[0] : jsonValues;
  }

  static resolveBinaryContentUrl(
    workflowId: string,
    viewContext: ViewedWorkflowContext,
    attachment: BinaryAttachment,
  ): string {
    if (viewContext === "live-workflow" && attachment.runId === "overlay-pin") {
      return ApiPaths.workflowOverlayBinaryContent(workflowId, attachment.id);
    }
    return ApiPaths.runBinaryContent(attachment.runId, attachment.id);
  }

  static toAttachmentModels(
    items: Items | undefined,
    workflowId: string,
    viewContext: ViewedWorkflowContext,
  ): ReadonlyArray<WorkflowExecutionInspectorAttachmentModel> {
    if (!items) {
      return [];
    }
    const attachments: WorkflowExecutionInspectorAttachmentModel[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]!;
      for (const [name, attachment] of Object.entries(item.binary ?? {})) {
        attachments.push({
          key: `${itemIndex}:${name}:${attachment.id}`,
          itemIndex,
          name,
          contentUrl: this.resolveBinaryContentUrl(workflowId, viewContext, attachment),
          attachment,
        });
      }
    }
    return attachments;
  }

  static extractBinaryMapsFromItems(items: Items | undefined): PinBinaryMapsByItemIndex {
    return (items ?? []).map((item) => ({ ...(item.binary ?? {}) }));
  }

  static reindexBinaryMapsForItemCount(maps: PinBinaryMapsByItemIndex, itemCount: number): PinBinaryMapsByItemIndex {
    const next: Array<Readonly<Record<string, BinaryAttachment>>> = [];
    for (let i = 0; i < itemCount; i += 1) {
      next.push(i < maps.length ? { ...maps[i] } : {});
    }
    return next;
  }

  static mergePinOutputJsonWithBinaryMaps(jsonText: string, binaryMapsByItemIndex: PinBinaryMapsByItemIndex): Items {
    const parsed = this.parseEditableItems(jsonText);
    return parsed.map((item, index) => ({
      json: item.json,
      binary: { ...(binaryMapsByItemIndex[index] ?? {}) },
    }));
  }

  static async uploadOverlayPinnedBinary(
    args: Readonly<{
      workflowId: string;
      nodeId: string;
      itemIndex: number;
      attachmentName: string;
      file: File;
    }>,
  ): Promise<BinaryAttachment> {
    const form = new FormData();
    form.set("file", args.file);
    form.set("nodeId", args.nodeId);
    form.set("itemIndex", String(args.itemIndex));
    form.set("attachmentName", args.attachmentName);
    const body = await codemationApiClient.postFormData<{ attachment: BinaryAttachment }>(
      ApiPaths.workflowDebuggerOverlayBinaryUpload(args.workflowId),
      form,
    );
    return body.attachment;
  }

  static getRunQueryKey(runId: string): readonly ["run", string] {
    return ["run", runId];
  }

  static getWorkflowRunsQueryKey(workflowId: string): readonly ["workflow-runs", string] {
    return ["workflow-runs", workflowId];
  }

  static getWorkflowDebuggerOverlayQueryKey(workflowId: string): readonly ["workflow-debugger-overlay", string] {
    return ["workflow-debugger-overlay", workflowId];
  }

  static toRunSummary(state: PersistedRunState): RunSummary {
    return {
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      status: state.status,
      finishedAt: RunFinishedAtFactory.resolveIso(state),
      parent: state.parent,
      executionOptions: state.executionOptions,
    };
  }

  static mergeRunSummaryList(
    existing: ReadonlyArray<RunSummary> | undefined,
    summary: RunSummary,
  ): ReadonlyArray<RunSummary> {
    const current = [...(existing ?? [])];
    const index = current.findIndex((entry) => entry.runId === summary.runId);
    if (index >= 0) {
      current[index] = summary;
    } else {
      current.unshift(summary);
    }
    current.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    return current;
  }

  static getErrorHeadline(error: NodeExecutionError | undefined): string {
    if (!error) return "Execution failed";
    return error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message;
  }

  static getErrorStack(error: NodeExecutionError | undefined): string | null {
    if (!error) return null;
    return error.stack?.trim() || null;
  }

  static getErrorClipboardText(error: NodeExecutionError | undefined): string {
    if (!error) return "";
    return [this.getErrorHeadline(error), this.getErrorDetails(error), this.getErrorStack(error)]
      .filter((value): value is string => Boolean(value))
      .join("\n\n");
  }

  static isTriggerStartedWorkflow(workflow: WorkflowDto | undefined): boolean {
    return workflow?.nodes.some((node) => node.kind === "trigger") ?? false;
  }

  private static shouldSynthesizeTriggerItems(workflow: WorkflowDto | undefined, request: RunWorkflowRequest): boolean {
    return Boolean(this.resolveTriggerTestNodeId(workflow, request));
  }

  private static resolveTriggerTestNodeId(
    workflow: WorkflowDto | undefined,
    request: RunWorkflowRequest,
  ): string | undefined {
    if (request.items !== undefined) {
      return undefined;
    }
    if (request.stopAt && this.isTriggerNode(workflow, request.stopAt)) {
      return request.stopAt;
    }
    if (request.startAt && this.isTriggerNode(workflow, request.startAt)) {
      return request.startAt;
    }
    if (!request.stopAt && this.isTriggerStartedWorkflow(workflow)) {
      return workflow?.nodes.find((node) => node.kind === "trigger")?.id;
    }
    return undefined;
  }

  private static isTriggerNode(workflow: WorkflowDto | undefined, nodeId: string): boolean {
    return workflow?.nodes.find((node) => node.id === nodeId)?.kind === "trigger";
  }

  static getExecutionModeLabel(
    run: Pick<RunSummary, "executionOptions"> | Pick<PersistedRunState, "executionOptions"> | undefined,
  ): string | null {
    const mode = run?.executionOptions?.mode;
    if (mode === "manual") return "Manual";
    if (mode === "debug") return "Debug";
    return null;
  }

  static isMutableExecution(run: Pick<PersistedRunState, "executionOptions"> | undefined): boolean {
    return Boolean(run?.executionOptions?.isMutable);
  }

  private static getErrorDetails(error: NodeExecutionError | undefined): string | null {
    if (!error?.details) {
      return null;
    }
    return JSON.stringify(error.details, null, 2);
  }

  private static getSnapshotDurationMs(snapshot: NodeExecutionSnapshot | undefined): number | null {
    if (!snapshot?.startedAt || !snapshot.finishedAt) {
      return null;
    }
    const startedAt = Date.parse(snapshot.startedAt);
    const finishedAt = Date.parse(snapshot.finishedAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
      return null;
    }
    return finishedAt - startedAt;
  }

  static async replaceWorkflowDebuggerOverlay(
    workflowId: string,
    currentState: WorkflowDebuggerOverlayState["currentState"],
  ): Promise<WorkflowDebuggerOverlayState> {
    return await codemationApiClient.putJson<WorkflowDebuggerOverlayState>(
      ApiPaths.workflowDebuggerOverlay(workflowId),
      {
        currentState,
      },
    );
  }

  static async copyRunToDebuggerOverlay(
    workflowId: string,
    sourceRunId: string,
  ): Promise<WorkflowDebuggerOverlayState> {
    return await codemationApiClient.postJson<WorkflowDebuggerOverlayState>(
      ApiPaths.workflowDebuggerOverlayCopyRun(workflowId),
      {
        sourceRunId,
      },
    );
  }

  static workflowFromSnapshot(
    snapshot: PersistedWorkflowSnapshot | undefined,
    fallback: WorkflowDto | undefined,
  ): WorkflowDto | undefined {
    if (!snapshot) {
      return fallback;
    }
    return this.persistedWorkflowDtoMapper.map(snapshot);
  }

  static resolveViewedWorkflow(
    args: Readonly<{ selectedRun?: PersistedRunState; liveWorkflow?: WorkflowDto }>,
  ): WorkflowDto | undefined {
    return this.workflowFromSnapshot(args.selectedRun?.workflowSnapshot, args.liveWorkflow);
  }

  static resolveViewedWorkflowForContext(
    args: Readonly<{
      viewContext: ViewedWorkflowContext;
      selectedRun?: PersistedRunState;
      activeLiveRun?: PersistedRunState;
      liveWorkflow?: WorkflowDto;
    }>,
  ): WorkflowDto | undefined {
    const run = args.viewContext === "live-workflow" ? (args.activeLiveRun ?? args.selectedRun) : args.selectedRun;
    return this.workflowFromSnapshot(run?.workflowSnapshot, args.liveWorkflow);
  }

  static createWorkflowStructureSignature(workflow: WorkflowDto | undefined): string {
    return JSON.stringify(workflow ?? null);
  }

  static getPinnedOutputsByPort(
    currentState: InspectableExecutionState | undefined,
    nodeId: string | null,
  ): Readonly<Record<string, Items>> | undefined {
    if (!currentState || !nodeId) {
      return undefined;
    }
    return currentState.mutableState?.nodesById?.[nodeId]?.pinnedOutputsByPort;
  }

  static getPinnedOutputForPort(
    currentState: InspectableExecutionState | undefined,
    nodeId: string | null,
    portName: string | null,
  ): Items | undefined {
    if (!portName) {
      return undefined;
    }
    return this.getPinnedOutputsByPort(currentState, nodeId)?.[portName];
  }

  static reconcileCurrentStateWithWorkflow(
    currentState: WorkflowDebuggerOverlayState["currentState"] | undefined,
    workflow: WorkflowDto | undefined,
  ): WorkflowDebuggerOverlayState["currentState"] | undefined {
    if (!currentState || !workflow) {
      return currentState;
    }
    const workflowNodeIds = new Set(workflow.nodes.map((node) => node.id));
    return {
      outputsByNode: Object.fromEntries(
        Object.entries(currentState.outputsByNode).filter(([nodeId]) =>
          this.isCompatibleWorkflowNodeId(workflowNodeIds, nodeId),
        ),
      ),
      nodeSnapshotsByNodeId: Object.fromEntries(
        Object.entries(currentState.nodeSnapshotsByNodeId).filter(([nodeId]) =>
          this.isCompatibleWorkflowNodeId(workflowNodeIds, nodeId),
        ),
      ),
      connectionInvocations: currentState.connectionInvocations?.filter(
        (inv) => workflowNodeIds.has(inv.connectionNodeId) && workflowNodeIds.has(inv.parentAgentNodeId),
      ),
      mutableState: currentState.mutableState
        ? {
            nodesById: Object.fromEntries(
              Object.entries(currentState.mutableState.nodesById).filter(([nodeId]) =>
                this.isCompatibleWorkflowNodeId(workflowNodeIds, nodeId),
              ),
            ),
          }
        : undefined,
    };
  }

  static createLiveRunCurrentState(
    request: RunWorkflowRequest,
    currentState:
      | Pick<RunCurrentState, "outputsByNode" | "nodeSnapshotsByNodeId" | "mutableState" | "connectionInvocations">
      | undefined,
  ): RunCurrentState {
    if (this.shouldStartWorkflowFromCleanState(request)) {
      return this.createCleanRunCurrentState(currentState);
    }
    return this.cloneRunCurrentState(currentState);
  }

  static toEditableJson(items: Items | undefined): string {
    const value = this.toJsonValue(items);
    return JSON.stringify(value ?? {}, null, 2);
  }

  /**
   * Initial JSON for the pin-output editor only: always a top-level JSON array of per-item payloads.
   * Matches engine `Items` semantics and the Binaries tab (item indices). Display code elsewhere may still
   * use {@link toEditableJson} to reduce noise for single items.
   */
  static toPinOutputEditorJson(items: Items | undefined): string {
    if (items === undefined) {
      return JSON.stringify([{}], null, 2);
    }
    if (items.length === 0) {
      return JSON.stringify([], null, 2);
    }
    return JSON.stringify(
      items.map((item) => item.json),
      null,
      2,
    );
  }

  /**
   * Ensures pin-output editor submissions are a JSON array at the top level (`{}` → `[{}]`, `[{}]` unchanged).
   * API / {@link parseEditableItems} already accept both; this keeps the saved text aligned with the engine model.
   */
  static formatPinOutputJsonForSubmit(text: string): string {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || parsed === undefined) {
      return JSON.stringify([], null, 2);
    }
    const array = Array.isArray(parsed) ? parsed : [parsed];
    return JSON.stringify(array, null, 2);
  }

  static parseEditableItems(text: string): Items {
    const parsed = JSON.parse(text) as unknown;
    return this.itemsInputNormalizer.normalize(parsed);
  }

  static parseWorkflowSnapshot(text: string): PersistedWorkflowSnapshot {
    return JSON.parse(text) as PersistedWorkflowSnapshot;
  }

  static buildExecutionNodes(
    workflow: WorkflowDto | undefined,
    executionState: InspectableExecutionState | undefined,
  ): ReadonlyArray<ExecutionNode> {
    if (!workflow) return [];
    const snapshots = Object.values(executionState?.nodeSnapshotsByNodeId ?? {}).filter((snapshot) =>
      this.visibleExecutionStatuses.has(snapshot.status),
    );
    const executionStateForInvocations: InspectableExecutionState | undefined =
      executionState === undefined
        ? undefined
        : {
            ...executionState,
            connectionInvocations: this.normalizeConnectionInvocations(executionState.connectionInvocations),
          };
    const flat = workflow.nodes.flatMap((node) =>
      this.createExecutionNodesForWorkflowNode(node, snapshots, executionStateForInvocations),
    );
    const withItemGroups = ExecutionTreeItemGroupInjector.inject(flat);
    return [...withItemGroups].sort((left, right) => this.compareExecutionNodes(left, right));
  }

  static buildHistoricalExecutionNodes(
    workflow: WorkflowDto | undefined,
    executionDetail: WorkflowRunDetailDto | undefined,
    historicalRunState?: PersistedRunState,
  ): ReadonlyArray<ExecutionNode> {
    if (!workflow) {
      return [];
    }
    const historicalNodes = (executionDetail?.executionInstances ?? [])
      .map((instance) => this.createHistoricalExecutionNode(workflow, instance))
      .filter((entry): entry is ExecutionNode => entry !== undefined)
      .sort((left, right) => this.compareExecutionNodes(left, right));
    if (!historicalRunState?.connectionInvocations?.length) {
      return historicalNodes;
    }
    const fallbackInvocationNodes = this.buildFallbackHistoricalInvocationNodes(workflow, historicalRunState).filter(
      (entry) => !historicalNodes.some((existing) => existing.node.id === entry.node.id),
    );
    return [...historicalNodes, ...fallbackInvocationNodes].sort((left, right) =>
      this.compareExecutionNodes(left, right),
    );
  }

  /**
   * Required credential slots that are still unbound (excluding optional credential slots).
   */
  static resolveCredentialAttention(
    args: Readonly<{
      workflow: WorkflowDto | undefined;
      slots: ReadonlyArray<WorkflowCredentialHealthSlotDto> | undefined;
    }>,
  ): Readonly<{ attentionNodeIds: ReadonlySet<string>; summaryLines: ReadonlyArray<string> }> {
    const slots = args.slots ?? [];
    const workflow = args.workflow;
    const attentionNodeIds = new Set<string>();
    const summaryLines: string[] = [];
    for (const slot of slots) {
      if (slot.health.status !== "unbound") {
        continue;
      }
      attentionNodeIds.add(slot.nodeId);
      const label = slot.nodeName ?? workflow?.nodes.find((n) => n.id === slot.nodeId)?.name ?? slot.nodeId;
      summaryLines.push(`${label} · ${slot.requirement.label}`);
    }
    return { attentionNodeIds, summaryLines };
  }

  static buildExecutionTreeData(nodes: ReadonlyArray<ExecutionNode>): ReadonlyArray<ExecutionTreeNode> {
    return WorkflowExecutionTreeBuilder.build(nodes);
  }

  /** Resolves the selected rendered tree key when execution row ids need disambiguation. */
  static resolveExecutionTreeKeyForNodeId(
    executionNodes: ReadonlyArray<ExecutionNode>,
    selectedNodeId: string | null,
  ): string | null {
    return WorkflowExecutionTreeBuilder.resolveSelectionKey(executionNodes, selectedNodeId);
  }

  static collectExecutionTreeKeys(nodes: ReadonlyArray<ExecutionTreeNode>): ReadonlyArray<string> {
    return WorkflowExecutionTreeBuilder.collectBranchKeys(nodes);
  }

  private static compareExecutionNodes(left: ExecutionNode, right: ExecutionNode): number {
    const timestampComparison = (this.getSnapshotTimestamp(left.snapshot) ?? "").localeCompare(
      this.getSnapshotTimestamp(right.snapshot) ?? "",
    );
    if (timestampComparison !== 0) return timestampComparison;
    const idTie = left.node.id.localeCompare(right.node.id);
    if (idTie !== 0) return idTie;
    const roleComparison = this.compareExecutionNodeRoles(left.node.role, right.node.role);
    if (roleComparison !== 0) return roleComparison;
    return this.getNodeDisplayName(left.node, left.node.id).localeCompare(
      this.getNodeDisplayName(right.node, right.node.id),
    );
  }

  private static resolveHistoricalInspectorNodeIdForCanvasPick(
    canvasWorkflowNodeId: string,
    executionDetail: WorkflowRunDetailDto | undefined,
  ): string | null {
    const slotState = executionDetail?.slotStates.find((entry) => entry.slotNodeId === canvasWorkflowNodeId);
    return (
      slotState?.latestRunningInstanceId ?? slotState?.latestTerminalInstanceId ?? slotState?.latestInstanceId ?? null
    );
  }

  /**
   * Deduplicates connection invocation rows by `invocationId` (keeps the newest `updatedAt`),
   * then sorts for stable UI ordering. Use this for canvas badges and anywhere the execution
   * tree should stay consistent with persisted run state.
   */
  static normalizeConnectionInvocations(
    invocations: ReadonlyArray<ConnectionInvocationRecord> | undefined,
  ): ReadonlyArray<ConnectionInvocationRecord> {
    if (!invocations || invocations.length === 0) {
      return [];
    }
    const byId = new Map<string, ConnectionInvocationRecord>();
    for (const inv of invocations) {
      const prev = byId.get(inv.invocationId);
      if (!prev || prev.updatedAt.localeCompare(inv.updatedAt) <= 0) {
        byId.set(inv.invocationId, inv);
      }
    }
    return [...byId.values()].sort((left, right) => {
      const t = left.updatedAt.localeCompare(right.updatedAt);
      if (t !== 0) return t;
      return left.invocationId.localeCompare(right.invocationId);
    });
  }

  private static compareExecutionNodeRoles(leftRole: string | undefined, rightRole: string | undefined): number {
    const leftPriority = this.getExecutionNodeRolePriority(leftRole);
    const rightPriority = this.getExecutionNodeRolePriority(rightRole);
    return leftPriority - rightPriority;
  }

  private static getExecutionNodeRolePriority(role: string | undefined): number {
    if (role === "agent") return 0;
    if (role === "languageModel") return 1;
    if (role === "nestedAgent") return 2;
    if (role === "tool") return 3;
    return 4;
  }

  private static isCompatibleWorkflowNodeId(workflowNodeIds: ReadonlySet<string>, nodeId: string): boolean {
    return workflowNodeIds.has(nodeId);
  }

  private static createExecutionNodesForWorkflowNode(
    node: WorkflowNode,
    snapshots: ReadonlyArray<NodeExecutionSnapshot>,
    executionState: InspectableExecutionState | undefined,
  ): ReadonlyArray<ExecutionNode> {
    const invocations = (executionState?.connectionInvocations ?? []).filter((inv) => inv.connectionNodeId === node.id);
    if (
      (node.role === "languageModel" || node.role === "tool" || node.role === "nestedAgent") &&
      invocations.length > 0
    ) {
      const ordered = [...invocations].sort((left, right) => {
        const t = left.updatedAt.localeCompare(right.updatedAt);
        if (t !== 0) return t;
        return left.invocationId.localeCompare(right.invocationId);
      });
      return ordered.map((inv) => ({
        node: this.createInvocationExecutionNode(node, inv.invocationId),
        snapshot: this.snapshotFromConnectionInvocation(inv),
        workflowNodeId: node.id,
        workflowConnectionNodeId: node.id,
        // The DTO already carries `parentInvocationId` for sub-agent invocations; falling back to
        // `parentAgentActivationId` keeps the previous behaviour for legacy persisted runs.
        parentInvocationId: inv.parentInvocationId ?? inv.parentAgentActivationId,
        iterationId: inv.iterationId,
        itemIndex: inv.itemIndex,
        parentAgentActivationId: inv.parentAgentActivationId,
        parentAgentNodeId: inv.parentAgentNodeId,
      }));
    }
    const matchingSnapshots = this.resolveMatchingSnapshots(node, snapshots);
    if (matchingSnapshots.length === 0) {
      return [];
    }
    if (!this.shouldCreateAttachmentInvocations(node, matchingSnapshots)) {
      return matchingSnapshots.map((snapshot) => ({
        node: snapshot.nodeId === node.id ? node : this.createSyntheticExecutionNode(node, snapshot),
        snapshot,
        workflowNodeId: node.id,
      }));
    }
    return matchingSnapshots
      .filter((snapshot) => snapshot.nodeId !== node.id)
      .map((snapshot) => ({
        node: this.createSyntheticExecutionNode(node, snapshot),
        snapshot,
        workflowNodeId: node.id,
      }));
  }

  private static createInvocationExecutionNode(baseNode: WorkflowNode, invocationId: string): WorkflowNode {
    return {
      ...baseNode,
      id: invocationId,
    };
  }

  private static createHistoricalExecutionNode(
    workflow: WorkflowDto,
    instance: ExecutionInstanceDto,
  ): ExecutionNode | undefined {
    const baseNode =
      workflow.nodes.find((node) => node.id === instance.slotNodeId) ??
      workflow.nodes.find((node) => node.id === instance.workflowNodeId);
    if (!baseNode) {
      return undefined;
    }
    return {
      node: {
        ...baseNode,
        id: instance.instanceId,
      },
      snapshot: this.snapshotFromExecutionInstance(instance),
      executionInstanceId: instance.instanceId,
      slotNodeId: instance.slotNodeId,
      parentExecutionInstanceId: instance.parentInstanceId,
      workflowNodeId: baseNode.id,
      workflowConnectionNodeId: instance.kind === "connectionInvocation" ? instance.slotNodeId : undefined,
    };
  }

  private static buildFallbackHistoricalInvocationNodes(
    workflow: WorkflowDto,
    historicalRunState: PersistedRunState,
  ): ReadonlyArray<ExecutionNode> {
    return this.buildExecutionNodes(workflow, {
      mutableState: historicalRunState.mutableState,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: historicalRunState.connectionInvocations,
    }).filter((entry) => entry.workflowConnectionNodeId !== undefined);
  }

  private static snapshotFromConnectionInvocation(inv: ConnectionInvocationRecord): NodeExecutionSnapshot {
    const mainIn = this.jsonValueToMainItems(inv.managedInput);
    const mainOut = this.jsonValueToMainItems(inv.managedOutput);
    return {
      runId: inv.runId,
      workflowId: inv.workflowId,
      nodeId: inv.invocationId,
      activationId: inv.parentAgentActivationId,
      parent: { runId: inv.runId, workflowId: inv.workflowId, nodeId: inv.parentAgentNodeId },
      status: inv.status,
      queuedAt: inv.queuedAt,
      startedAt: inv.startedAt,
      finishedAt: inv.finishedAt,
      updatedAt: inv.updatedAt,
      inputsByPort: mainIn ? { main: mainIn } : undefined,
      outputs: mainOut ? { main: mainOut } : undefined,
      error: inv.error,
    };
  }

  private static snapshotFromExecutionInstance(instance: ExecutionInstanceDto): NodeExecutionSnapshot {
    return {
      runId: "historical-run",
      workflowId: "historical-workflow",
      nodeId: instance.instanceId,
      activationId: instance.activationId,
      status: instance.status,
      queuedAt: instance.queuedAt,
      startedAt: instance.startedAt,
      finishedAt: instance.finishedAt,
      updatedAt: instance.finishedAt ?? instance.startedAt ?? instance.queuedAt ?? new Date(0).toISOString(),
      inputsByPort: this.jsonValueToPortItems(instance.inputJson),
      outputs: this.jsonValueToPortItems(instance.outputJson),
      error: instance.error,
    };
  }

  private static jsonValueToMainItems(value: unknown | undefined): Items | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return [{ json: {} }];
    }
    if (Array.isArray(value)) {
      return value.map((json) => ({ json: json as object }));
    }
    return [{ json: value as object }];
  }

  private static jsonValueToPortItems(value: unknown | undefined): Readonly<Record<string, Items>> | undefined {
    if (value === undefined || value === null || Array.isArray(value)) {
      const main = this.jsonValueToMainItems(value);
      return main ? { main } : undefined;
    }
    if (typeof value !== "object") {
      return { main: [{ json: value as object }] };
    }
    const record = value as Record<string, unknown>;
    const values = Object.values(record);
    const looksLikePortMap = values.every((entry) => entry === undefined || entry === null || Array.isArray(entry));
    if (!looksLikePortMap) {
      return { main: [{ json: record as object }] };
    }
    const portMap: Record<string, Items> = {};
    for (const [portName, portValue] of Object.entries(record)) {
      const items = this.jsonValueToMainItems(portValue);
      if (items) {
        portMap[portName] = items;
      }
    }
    return Object.keys(portMap).length > 0 ? portMap : undefined;
  }

  private static resolveMatchingSnapshots(
    node: WorkflowNode,
    snapshots: ReadonlyArray<NodeExecutionSnapshot>,
  ): ReadonlyArray<NodeExecutionSnapshot> {
    return snapshots.filter((snapshot) => {
      if (node.role === "languageModel") {
        return snapshot.nodeId === node.id;
      }
      if (node.role === "tool" || node.role === "nestedAgent") {
        return snapshot.nodeId === node.id;
      }
      return snapshot.nodeId === node.id;
    });
  }

  private static shouldCreateAttachmentInvocations(
    node: WorkflowNode,
    snapshots: ReadonlyArray<NodeExecutionSnapshot>,
  ): boolean {
    if (node.role !== "languageModel" && node.role !== "tool" && node.role !== "nestedAgent") {
      return false;
    }
    return snapshots.some((snapshot) => snapshot.nodeId !== node.id);
  }

  private static createSyntheticExecutionNode(node: WorkflowNode, snapshot: NodeExecutionSnapshot): WorkflowNode {
    return {
      ...node,
      id: snapshot.nodeId,
    };
  }

  private static shouldStartWorkflowFromCleanState(request: RunWorkflowRequest): boolean {
    return !request.startAt && !request.stopAt && !request.clearFromNodeId && !request.sourceRunId;
  }

  private static createCleanRunCurrentState(
    currentState:
      | Pick<RunCurrentState, "outputsByNode" | "nodeSnapshotsByNodeId" | "mutableState" | "connectionInvocations">
      | undefined,
  ): RunCurrentState {
    return {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      mutableState: this.cloneMutableState(currentState?.mutableState),
    };
  }

  private static cloneRunCurrentState(
    currentState:
      | Pick<RunCurrentState, "outputsByNode" | "nodeSnapshotsByNodeId" | "mutableState" | "connectionInvocations">
      | undefined,
  ): RunCurrentState {
    return {
      outputsByNode: JSON.parse(JSON.stringify(currentState?.outputsByNode ?? {})) as RunCurrentState["outputsByNode"],
      nodeSnapshotsByNodeId: JSON.parse(
        JSON.stringify(currentState?.nodeSnapshotsByNodeId ?? {}),
      ) as RunCurrentState["nodeSnapshotsByNodeId"],
      connectionInvocations: currentState?.connectionInvocations
        ? (JSON.parse(JSON.stringify(currentState.connectionInvocations)) as NonNullable<
            RunCurrentState["connectionInvocations"]
          >)
        : undefined,
      mutableState: this.cloneMutableState(currentState?.mutableState),
    };
  }

  private static cloneMutableState(
    mutableState: RunCurrentState["mutableState"] | undefined,
  ): NonNullable<RunCurrentState["mutableState"]> {
    return JSON.parse(
      JSON.stringify(
        mutableState ?? {
          nodesById: {},
        },
      ),
    ) as NonNullable<RunCurrentState["mutableState"]>;
  }
}
