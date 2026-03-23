import { AgentAttachmentNodeIdFactory,ItemsInputNormalizer,RunFinishedAtFactory } from "@codemation/core/browser";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { codemationApiClient } from "../../../../api/CodemationApiClient";
import { format,isToday,isYesterday } from "date-fns";
import prettyMilliseconds from "pretty-ms";
import type {
Items,
NodeExecutionSnapshot,
PersistedRunState,
PersistedWorkflowSnapshot,
RunCurrentState,
RunSummary,
WorkflowDebuggerOverlayState,
WorkflowDto,
} from "../../hooks/realtime/realtime";
import { PersistedWorkflowSnapshotMapper } from "./PersistedWorkflowSnapshotMapper";
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

  static async runWorkflow(workflowId: string, workflow: WorkflowDto | undefined, request: RunWorkflowRequest = {}): Promise<RunWorkflowResult> {
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

  static async updateWorkflowSnapshot(runId: string, workflowSnapshot: PersistedWorkflowSnapshot): Promise<PersistedRunState> {
    return await codemationApiClient.patchJson<PersistedRunState>(ApiPaths.runWorkflowSnapshot(runId), { workflowSnapshot });
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
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const time = format(date, "HH:mm");
    if (isToday(date)) return `Today · ${time}`;
    if (isYesterday(date)) return `Yesterday · ${time}`;
    return format(date, "EEE d MMM yyyy · HH:mm");
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

  static inspectorSelectionAnchorsDisplayedWorkflow(nodeId: string | null, workflow: WorkflowDto | undefined): boolean {
    if (!nodeId || !workflow?.nodes.length) {
      return false;
    }
    if (workflow.nodes.some((n) => n.id === nodeId)) {
      return true;
    }
    const baseLlm = AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(nodeId);
    if (baseLlm !== nodeId && workflow.nodes.some((n) => n.id === baseLlm)) {
      return true;
    }
    const baseTool = AgentAttachmentNodeIdFactory.getBaseToolNodeId(nodeId);
    if (baseTool !== nodeId && workflow.nodes.some((n) => n.id === baseTool)) {
      return true;
    }
    return false;
  }

  static resolveInspectorNodeIdForCanvasPick(
    canvasWorkflowNodeId: string,
    workflow: WorkflowDto | undefined,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>> | undefined,
  ): string {
    const wfNode = workflow?.nodes.find((n) => n.id === canvasWorkflowNodeId);
    if (!wfNode) {
      return canvasWorkflowNodeId;
    }
    const snapshots = Object.values(nodeSnapshotsByNodeId ?? {}).filter((snapshot) =>
      this.visibleExecutionStatuses.has(snapshot.status),
    );
    const matching = snapshots.filter((snapshot) => {
      if (wfNode.role === "languageModel") {
        return AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(snapshot.nodeId) === canvasWorkflowNodeId;
      }
      if (wfNode.role === "tool") {
        return AgentAttachmentNodeIdFactory.getBaseToolNodeId(snapshot.nodeId) === canvasWorkflowNodeId;
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

  static applyPinnedOutputToPortEntries(entries: PortEntries, pinnedOutput: Items | undefined): PortEntries {
    if (typeof pinnedOutput === "undefined") {
      return entries;
    }
    return [["main", pinnedOutput], ...entries.filter(([portName]) => portName !== "main")];
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
    if (viewContext === "live-workflow") {
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

  static async uploadOverlayPinnedBinary(args: Readonly<{
    workflowId: string;
    nodeId: string;
    itemIndex: number;
    attachmentName: string;
    file: File;
  }>): Promise<BinaryAttachment> {
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

  static mergeRunSummaryList(existing: ReadonlyArray<RunSummary> | undefined, summary: RunSummary): ReadonlyArray<RunSummary> {
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
    return [this.getErrorHeadline(error), this.getErrorStack(error)].filter((value): value is string => Boolean(value)).join("\n\n");
  }

  static isTriggerStartedWorkflow(workflow: WorkflowDto | undefined): boolean {
    return workflow?.nodes.some((node) => node.kind === "trigger") ?? false;
  }

  private static shouldSynthesizeTriggerItems(workflow: WorkflowDto | undefined, request: RunWorkflowRequest): boolean {
    return Boolean(this.resolveTriggerTestNodeId(workflow, request));
  }

  private static resolveTriggerTestNodeId(workflow: WorkflowDto | undefined, request: RunWorkflowRequest): string | undefined {
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

  static getExecutionModeLabel(run: Pick<RunSummary, "executionOptions"> | Pick<PersistedRunState, "executionOptions"> | undefined): string | null {
    const mode = run?.executionOptions?.mode;
    if (mode === "manual") return "Manual";
    if (mode === "debug") return "Debug";
    return null;
  }

  static isMutableExecution(run: Pick<PersistedRunState, "executionOptions"> | undefined): boolean {
    return Boolean(run?.executionOptions?.isMutable);
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
    return await codemationApiClient.putJson<WorkflowDebuggerOverlayState>(ApiPaths.workflowDebuggerOverlay(workflowId), {
      currentState,
    });
  }

  static async copyRunToDebuggerOverlay(workflowId: string, sourceRunId: string): Promise<WorkflowDebuggerOverlayState> {
    return await codemationApiClient.postJson<WorkflowDebuggerOverlayState>(ApiPaths.workflowDebuggerOverlayCopyRun(workflowId), {
      sourceRunId,
    });
  }

  static workflowFromSnapshot(snapshot: PersistedWorkflowSnapshot | undefined, fallback: WorkflowDto | undefined): WorkflowDto | undefined {
    if (!snapshot) {
      return fallback;
    }
    return this.persistedWorkflowDtoMapper.map(snapshot);
  }

  static resolveViewedWorkflow(args: Readonly<{ selectedRun?: PersistedRunState; liveWorkflow?: WorkflowDto }>): WorkflowDto | undefined {
    return this.workflowFromSnapshot(args.selectedRun?.workflowSnapshot, args.liveWorkflow);
  }

  static createWorkflowStructureSignature(workflow: WorkflowDto | undefined): string {
    return JSON.stringify(workflow ?? null);
  }

  static getPinnedOutput(currentState: InspectableExecutionState | undefined, nodeId: string | null): Items | undefined {
    if (!currentState || !nodeId) {
      return undefined;
    }
    return currentState.mutableState?.nodesById?.[nodeId]?.pinnedOutputsByPort?.main;
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
        Object.entries(currentState.outputsByNode).filter(([nodeId]) => this.isCompatibleWorkflowNodeId(workflowNodeIds, nodeId)),
      ),
      nodeSnapshotsByNodeId: Object.fromEntries(
        Object.entries(currentState.nodeSnapshotsByNodeId).filter(([nodeId]) => this.isCompatibleWorkflowNodeId(workflowNodeIds, nodeId)),
      ),
      mutableState: currentState.mutableState
        ? {
            nodesById: Object.fromEntries(
              Object.entries(currentState.mutableState.nodesById).filter(([nodeId]) => this.isCompatibleWorkflowNodeId(workflowNodeIds, nodeId)),
            ),
          }
        : undefined,
    };
  }

  static createLiveRunCurrentState(
    request: RunWorkflowRequest,
    currentState: Pick<RunCurrentState, "outputsByNode" | "nodeSnapshotsByNodeId" | "mutableState"> | undefined,
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
    return workflow.nodes
      .flatMap((node) => this.createExecutionNodesForWorkflowNode(node, snapshots))
      .sort((left, right) => this.compareExecutionNodes(left, right));
  }

  static buildExecutionTreeData(nodes: ReadonlyArray<ExecutionNode>): ReadonlyArray<ExecutionTreeNode> {
    const treeNodesById = new Map<string, ExecutionTreeNode>();
    const rootNodes: ExecutionTreeNode[] = [];

    for (const { node, snapshot } of nodes) {
      treeNodesById.set(node.id, {
        key: node.id,
        title: node.name ?? node.type ?? node.id,
        workflowNode: node,
        snapshot,
        children: [],
      });
    }

    for (const { node } of nodes) {
      const treeNode = treeNodesById.get(node.id);
      if (!treeNode) continue;
      if (!node.parentNodeId) {
        rootNodes.push(treeNode);
        continue;
      }
      const parentTreeNode = treeNodesById.get(node.parentNodeId);
      if (!parentTreeNode) {
        rootNodes.push(treeNode);
        continue;
      }
      const existingChildren = Array.isArray(parentTreeNode.children) ? [...parentTreeNode.children] : [];
      existingChildren.push(treeNode);
      parentTreeNode.children = existingChildren;
    }

    this.sortExecutionTree(rootNodes);
    return rootNodes;
  }

  static collectExecutionTreeKeys(nodes: ReadonlyArray<ExecutionTreeNode>): ReadonlyArray<string> {
    const keys: string[] = [];
    this.collectExecutionTreeKeysRecursive(nodes, keys);
    return keys;
  }

  private static collectExecutionTreeKeysRecursive(nodes: ReadonlyArray<ExecutionTreeNode>, keys: string[]): void {
    for (const node of nodes) {
      keys.push(String(node.key));
      const children = Array.isArray(node.children) ? (node.children as ExecutionTreeNode[]) : [];
      this.collectExecutionTreeKeysRecursive(children, keys);
    }
  }

  private static compareExecutionNodes(left: ExecutionNode, right: ExecutionNode): number {
    const timestampComparison = (this.getSnapshotTimestamp(left.snapshot) ?? "").localeCompare(this.getSnapshotTimestamp(right.snapshot) ?? "");
    if (timestampComparison !== 0) return timestampComparison;
    const roleComparison = this.compareExecutionNodeRoles(left.node.role, right.node.role);
    if (roleComparison !== 0) return roleComparison;
    return this.getNodeDisplayName(left.node, left.node.id).localeCompare(this.getNodeDisplayName(right.node, right.node.id));
  }

  private static compareExecutionNodeRoles(leftRole: string | undefined, rightRole: string | undefined): number {
    const leftPriority = this.getExecutionNodeRolePriority(leftRole);
    const rightPriority = this.getExecutionNodeRolePriority(rightRole);
    return leftPriority - rightPriority;
  }

  private static getExecutionNodeRolePriority(role: string | undefined): number {
    if (role === "agent") return 0;
    if (role === "languageModel") return 1;
    if (role === "tool") return 2;
    return 3;
  }

  private static isCompatibleWorkflowNodeId(workflowNodeIds: ReadonlySet<string>, nodeId: string): boolean {
    return (
      workflowNodeIds.has(nodeId)
      || workflowNodeIds.has(AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(nodeId))
      || workflowNodeIds.has(AgentAttachmentNodeIdFactory.getBaseToolNodeId(nodeId))
    );
  }

  private static sortExecutionTree(nodes: ExecutionTreeNode[]): void {
    nodes.sort((left, right) => {
      return this.compareExecutionNodes(
        {
          node: left.workflowNode!,
          snapshot: left.snapshot,
        },
        {
          node: right.workflowNode!,
          snapshot: right.snapshot,
        },
      );
    });
    for (const node of nodes) {
      const children = Array.isArray(node.children) ? (node.children as ExecutionTreeNode[]) : [];
      this.sortExecutionTree(children);
      node.children = children;
      node.isLeaf = children.length === 0;
    }
  }

  private static createExecutionNodesForWorkflowNode(
    node: WorkflowNode,
    snapshots: ReadonlyArray<NodeExecutionSnapshot>,
  ): ReadonlyArray<ExecutionNode> {
    const matchingSnapshots = this.resolveMatchingSnapshots(node, snapshots);
    if (matchingSnapshots.length === 0) {
      return [];
    }
    if (!this.shouldCreateAttachmentInvocations(node, matchingSnapshots)) {
      return matchingSnapshots.map((snapshot) => ({
        node: snapshot.nodeId === node.id ? node : this.createSyntheticExecutionNode(node, snapshot),
        snapshot,
      }));
    }
    return matchingSnapshots
      .filter((snapshot) => snapshot.nodeId !== node.id)
      .map((snapshot) => ({
        node: this.createSyntheticExecutionNode(node, snapshot),
        snapshot,
      }));
  }


  private static resolveMatchingSnapshots(
    node: WorkflowNode,
    snapshots: ReadonlyArray<NodeExecutionSnapshot>,
  ): ReadonlyArray<NodeExecutionSnapshot> {
    return snapshots.filter((snapshot) => {
      if (node.role === "languageModel") {
        return AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(snapshot.nodeId) === node.id;
      }
      if (node.role === "tool") {
        return AgentAttachmentNodeIdFactory.getBaseToolNodeId(snapshot.nodeId) === node.id;
      }
      return snapshot.nodeId === node.id;
    });
  }

  private static shouldCreateAttachmentInvocations(
    node: WorkflowNode,
    snapshots: ReadonlyArray<NodeExecutionSnapshot>,
  ): boolean {
    if (node.role !== "languageModel" && node.role !== "tool") {
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
    currentState: Pick<RunCurrentState, "outputsByNode" | "nodeSnapshotsByNodeId" | "mutableState"> | undefined,
  ): RunCurrentState {
    return {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      mutableState: this.cloneMutableState(currentState?.mutableState),
    };
  }

  private static cloneRunCurrentState(
    currentState: Pick<RunCurrentState, "outputsByNode" | "nodeSnapshotsByNodeId" | "mutableState"> | undefined,
  ): RunCurrentState {
    return {
      outputsByNode: JSON.parse(JSON.stringify(currentState?.outputsByNode ?? {})) as RunCurrentState["outputsByNode"],
      nodeSnapshotsByNodeId: JSON.parse(
        JSON.stringify(currentState?.nodeSnapshotsByNodeId ?? {}),
      ) as RunCurrentState["nodeSnapshotsByNodeId"],
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
