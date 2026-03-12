import { format, isToday, isYesterday } from "date-fns";
import { AgentAttachmentNodeIdFactory } from "@codemation/core";
import type {
  Items,
  NodeExecutionSnapshot,
  PersistedWorkflowSnapshot,
  PersistedRunState,
  RunSummary,
  WorkflowDto,
} from "../../realtime/realtime";
import { CodemationPersistedWorkflowDtoMapper } from "../../host/codemationPersistedWorkflowDtoMapper";
import { ApiPaths } from "../../api/ApiPaths";
import type {
  ExecutionNode,
  ExecutionTreeNode,
  InspectorMode,
  NodeExecutionError,
  PortEntries,
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
  startAt?: string;
  stopAt?: string;
  mode?: RunWorkflowMode;
  sourceRunId?: string;
}>;

export class WorkflowDetailPresenter {
  private static readonly persistedWorkflowDtoMapper = new CodemationPersistedWorkflowDtoMapper();

  static async runWorkflow(workflowId: string, workflow: WorkflowDto | undefined, request: RunWorkflowRequest = {}): Promise<RunWorkflowResult> {
    const response = await fetch(ApiPaths.run(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId,
        items: this.createRunItems(workflow),
        startAt: request.startAt,
        stopAt: request.stopAt,
        mode: request.mode,
        sourceRunId: request.sourceRunId,
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as RunWorkflowResult;
  }

  static async runNode(runId: string, nodeId: string, items: Items | undefined, mode?: RunWorkflowMode): Promise<RunWorkflowResult> {
    const response = await fetch(ApiPaths.runNode(runId, nodeId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items,
        mode,
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as RunWorkflowResult;
  }

  static async updatePinnedInput(runId: string, nodeId: string, items: Items | undefined): Promise<PersistedRunState> {
    const response = await fetch(ApiPaths.runNodePin(runId, nodeId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as PersistedRunState;
  }

  static async updateWorkflowSnapshot(runId: string, workflowSnapshot: PersistedWorkflowSnapshot): Promise<PersistedRunState> {
    const response = await fetch(ApiPaths.runWorkflowSnapshot(runId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowSnapshot }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as PersistedRunState;
  }

  static createRunItems(workflow: WorkflowDto | undefined): Items {
    if (this.isWebhookTriggeredWorkflow(workflow)) {
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

  static getNodeDisplayName(node: WorkflowNode | undefined, fallback: string | null): string {
    return node?.name ?? node?.type ?? fallback ?? "Unknown node";
  }

  static getSnapshotTimestamp(snapshot: NodeExecutionSnapshot | undefined): string | undefined {
    return snapshot?.finishedAt ?? snapshot?.updatedAt ?? snapshot?.startedAt ?? snapshot?.queuedAt;
  }

  static getDefaultInspectorMode(_snapshot: NodeExecutionSnapshot | undefined): InspectorMode {
    return "output";
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

  static toJsonValue(items: Items | undefined): unknown {
    if (!items || items.length === 0) return undefined;
    const jsonValues = items.map((item) => item.json);
    return jsonValues.length === 1 ? jsonValues[0] : jsonValues;
  }

  static getRunQueryKey(runId: string): readonly ["run", string] {
    return ["run", runId];
  }

  static getWorkflowRunsQueryKey(workflowId: string): readonly ["workflow-runs", string] {
    return ["workflow-runs", workflowId];
  }

  static toRunSummary(state: PersistedRunState): RunSummary {
    return {
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      status: state.status,
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

  static isWebhookTriggeredWorkflow(workflow: WorkflowDto | undefined): boolean {
    const firstTrigger = workflow?.nodes.find((node) => node.kind === "trigger");
    return firstTrigger?.type === "WebhookTriggerNode";
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

  static workflowFromSnapshot(snapshot: PersistedWorkflowSnapshot | undefined, fallback: WorkflowDto | undefined): WorkflowDto | undefined {
    if (!snapshot) {
      return fallback;
    }
    return this.persistedWorkflowDtoMapper.toDetail(snapshot);
  }

  static getPinnedInput(run: PersistedRunState | undefined, nodeId: string | null): Items | undefined {
    if (!run || !nodeId) {
      return undefined;
    }
    return run.mutableState?.nodesById?.[nodeId]?.pinnedInput;
  }

  static toEditableJson(items: Items | undefined): string {
    const value = this.toJsonValue(items);
    return JSON.stringify(value ?? {}, null, 2);
  }

  static parseEditableItems(text: string): Items {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((value) => ({ json: value }));
    }
    return [{ json: parsed }];
  }

  static parseWorkflowSnapshot(text: string): PersistedWorkflowSnapshot {
    return JSON.parse(text) as PersistedWorkflowSnapshot;
  }

  static buildExecutionNodes(workflow: WorkflowDto | undefined, selectedRun: PersistedRunState | undefined): ReadonlyArray<ExecutionNode> {
    if (!workflow) return [];
    const snapshots = Object.values(selectedRun?.nodeSnapshotsByNodeId ?? {}).filter((snapshot) => snapshot.status !== "pending");
    return workflow.nodes.flatMap((node) => this.createExecutionNodesForWorkflowNode(node, snapshots)).sort((left, right) => this.compareExecutionNodes(left, right));
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
}
