import JsonView from "@uiw/react-json-view";
import { githubLightTheme } from "@uiw/react-json-view/githubLight";
import { format, isToday, isYesterday } from "date-fns";
import {
  Bot,
  Boxes,
  Brain,
  Check,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  Copy,
  GitBranch,
  LoaderCircle,
  PanelBottomClose,
  PanelBottomOpen,
  PlaySquare,
  SquareStack,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Tree, { type FieldDataNode } from "rc-tree";
import {
  useRunQuery,
  useWorkflowQuery,
  useWorkflowRealtimeSubscription,
  useWorkflowRunsQuery,
  type Items,
  type NodeExecutionSnapshot,
  type PersistedRunState,
  type RunSummary,
  type WorkflowDto,
} from "../realtime/realtime";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiPaths } from "../api/ApiPaths";
import { WorkflowCanvas } from "../components/WorkflowCanvas";

type RunWorkflowResult = Readonly<{
  runId: string;
  workflowId: string;
  status: string;
  startedAt?: string;
  state: PersistedRunState | null;
}>;
type InspectorTab = "input" | "output" | "error";
type CopyState = "idle" | "copied";
type PortEntries = ReadonlyArray<readonly [string, Items]>;
type WorkflowNode = WorkflowDto["nodes"][number];
type ExecutionNode = Readonly<{ node: WorkflowNode; snapshot?: NodeExecutionSnapshot }>;
type NodeExecutionError = NonNullable<NodeExecutionSnapshot["error"]>;
type ExecutionTreeNode = FieldDataNode<
  Readonly<{
    key: string;
    title?: ReactNode;
    workflowNode?: WorkflowNode;
    snapshot?: NodeExecutionSnapshot;
  }>
>;

class WorkflowDetailPresenter {
  static async runWorkflow(workflowId: string): Promise<RunWorkflowResult> {
    const response = await fetch(ApiPaths.run(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId,
        items: [{ json: {} }],
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as RunWorkflowResult;
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

  static getDefaultInspectorTab(snapshot: NodeExecutionSnapshot | undefined): InspectorTab {
    return snapshot?.error ? "error" : "output";
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

  static buildExecutionNodes(workflow: WorkflowDto | undefined, selectedRun: PersistedRunState | undefined): ReadonlyArray<ExecutionNode> {
    if (!workflow) return [];
    const nodeSnapshotsByNodeId = selectedRun?.nodeSnapshotsByNodeId ?? {};
    return workflow.nodes
      .flatMap((node) => {
        const snapshot = nodeSnapshotsByNodeId[node.id];
        return snapshot && snapshot.status !== "pending" ? [{ node, snapshot } satisfies ExecutionNode] : [];
      })
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
}

class WorkflowNodeIconResolver {
  static resolveFallback(type: string, role?: string): LucideIcon {
    if (role === "agent") return Bot;
    if (role === "languageModel") return Brain;
    if (role === "tool") return Wrench;
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes("if")) return GitBranch;
    if (normalizedType.includes("subworkflow")) return Workflow;
    if (normalizedType.includes("map")) return SquareStack;
    if (normalizedType.includes("trigger")) return PlaySquare;
    if (normalizedType.includes("agent") || normalizedType.includes("ai")) return Bot;
    return Boxes;
  }
}

function WorkflowStatusIcon(args: Readonly<{ status: string; size?: number }>) {
  const { status, size = 16 } = args;
  if (status === "completed") {
    return <CircleCheckBig size={size} style={{ color: "#15803d" }} strokeWidth={2.1} />;
  }
  if (status === "failed") {
    return <CircleAlert size={size} style={{ color: "#b91c1c" }} strokeWidth={2.1} />;
  }
  if (status === "running" || status === "queued") {
    return <LoaderCircle size={size} style={{ color: "#2563eb", animation: "codemationSpin 1s linear infinite" }} strokeWidth={2.1} />;
  }
  return <Clock3 size={size} style={{ color: "#6b7280" }} strokeWidth={2.1} />;
}

function WorkflowInspectorJsonView(args: Readonly<{ value: unknown; emptyLabel: string }>) {
  const { value, emptyLabel } = args;
  const [collapsedLevel, setCollapsedLevel] = useState<boolean | number>(1);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const isRenderableJson = value !== null && typeof value === "object";

  if (value === undefined) {
    return <div style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setCollapsedLevel(true)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Collapse all
          </button>
          <button onClick={() => setCollapsedLevel(false)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Expand all
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{copyState === "copied" ? "Copied to clipboard" : "Use the copy icon in the viewer"}</div>
      </div>
      <div style={{ overflow: "auto", border: "1px solid #d1d5db", background: "#f8fafc", padding: 12 }}>
        {isRenderableJson ? (
          <JsonView
            value={value as object}
            collapsed={collapsedLevel}
            enableClipboard
            displayDataTypes={false}
            displayObjectSize
            shortenTextAfterLength={80}
            style={{
              ...githubLightTheme,
              backgroundColor: "transparent",
              padding: 0,
              fontSize: 12,
              lineHeight: 1.6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
            onCopied={() => {
              setCopyState("copied");
              window.setTimeout(() => setCopyState("idle"), 1500);
            }}
            onExpand={() => {
              if (copyState === "copied") setCopyState("idle");
            }}
          />
        ) : (
          <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function WorkflowInspectorErrorView(args: Readonly<{ error: NodeExecutionError | undefined; emptyLabel: string }>) {
  const { error, emptyLabel } = args;
  const [copyState, setCopyState] = useState<CopyState>("idle");

  if (!error) {
    return <div style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  const headline = WorkflowDetailPresenter.getErrorHeadline(error);
  const stack = WorkflowDetailPresenter.getErrorStack(error);

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10 }}>
      <div style={{ display: "grid", gap: 8, border: "1px solid #fecaca", background: "#fef2f2", padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: "#991b1b" }}>Error</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{headline}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#4b5563" }}>{stack ? "Full stacktrace" : "No stacktrace was captured for this error."}</div>
        <button
          onClick={() => {
            const value = WorkflowDetailPresenter.getErrorClipboardText(error);
            if (!value) return;
            void navigator.clipboard.writeText(value).then(() => {
              setCopyState("copied");
              window.setTimeout(() => setCopyState("idle"), 1500);
            });
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #d1d5db",
            background: "white",
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 12,
            color: "#111827",
          }}
        >
          {copyState === "copied" ? <Check size={14} strokeWidth={2.2} /> : <Copy size={14} strokeWidth={2.2} />}
          {copyState === "copied" ? "Copied" : "Copy stacktrace"}
        </button>
      </div>
      <div style={{ overflow: "auto", border: "1px solid #d1d5db", background: "#0f172a", color: "#e2e8f0", padding: 12 }}>
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {stack ?? headline}
        </pre>
      </div>
    </div>
  );
}

export function WorkflowDetailScreen(args: Readonly<{ workflowId: string; initialWorkflow: WorkflowDto }>) {
  const MIN_INSPECTOR_HEIGHT = 240;
  const MAX_INSPECTOR_HEIGHT = 640;
  const { workflowId, initialWorkflow } = args;
  const queryClient = useQueryClient();
  const workflowQuery = useWorkflowQuery(workflowId, initialWorkflow);
  const runsQuery = useWorkflowRunsQuery(workflowId);
  useWorkflowRealtimeSubscription(workflowId);

  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingSelectedRun, setPendingSelectedRun] = useState<RunSummary | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasManuallySelectedNode, setHasManuallySelectedNode] = useState(false);
  const [selectedTab, setSelectedTab] = useState<InspectorTab>("output");
  const [selectedInputPort, setSelectedInputPort] = useState<string | null>(null);
  const [selectedOutputPort, setSelectedOutputPort] = useState<string | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [inspectorHeight, setInspectorHeight] = useState(320);
  const [isInspectorResizing, setIsInspectorResizing] = useState(false);
  const resizeStartYRef = useRef<number | null>(null);
  const resizeStartHeightRef = useRef(320);
  const previousInspectorSelectionRef = useRef("");
  const previousInspectorHasErrorRef = useRef(false);

  const workflow = workflowQuery.data;
  const runs = runsQuery.data;
  const selectedRunQuery = useRunQuery(selectedRunId);
  const selectedRun = selectedRunQuery.data;
  const displayedRuns = useMemo(() => {
    if (!pendingSelectedRun) {
      return runs;
    }
    if (!runs) {
      return [pendingSelectedRun];
    }
    if (runs.some((run) => run.runId === pendingSelectedRun.runId)) {
      return runs;
    }
    return [pendingSelectedRun, ...runs];
  }, [pendingSelectedRun, runs]);

  useEffect(() => {
    if (pendingSelectedRun && runs?.some((run) => run.runId === pendingSelectedRun.runId)) {
      setPendingSelectedRun(null);
    }
  }, [pendingSelectedRun, runs]);

  useEffect(() => {
    if (!selectedRunId && displayedRuns?.length) {
      setSelectedRunId(displayedRuns[0]!.runId);
    }
  }, [displayedRuns, selectedRunId]);

  useEffect(() => {
    if (selectedRunId && displayedRuns?.some((run) => run.runId === selectedRunId)) {
      return;
    }
    setSelectedRunId(displayedRuns?.[0]?.runId ?? null);
  }, [displayedRuns, selectedRunId]);

  useEffect(() => {
    setHasManuallySelectedNode(false);
  }, [selectedRunId]);

  useEffect(() => {
    setSelectedRunId(null);
    setPendingSelectedRun(null);
    setSelectedNodeId(null);
    setHasManuallySelectedNode(false);
    setSelectedTab("output");
    setSelectedInputPort(null);
    setSelectedOutputPort(null);
    setIsPanelCollapsed(false);
    setInspectorHeight(320);
    setIsInspectorResizing(false);
    resizeStartYRef.current = null;
    resizeStartHeightRef.current = 320;
    previousInspectorSelectionRef.current = "";
    previousInspectorHasErrorRef.current = false;
  }, [workflowId]);

  useEffect(() => {
    if (!isInspectorResizing) return;
    const handleMouseMove = (event: MouseEvent) => {
      if (resizeStartYRef.current === null) return;
      const nextHeight = resizeStartHeightRef.current + (resizeStartYRef.current - event.clientY);
      setInspectorHeight(Math.max(MIN_INSPECTOR_HEIGHT, Math.min(MAX_INSPECTOR_HEIGHT, nextHeight)));
    };
    const handleMouseUp = () => {
      setIsInspectorResizing(false);
      resizeStartYRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isInspectorResizing]);

  useEffect(() => {
    if (!workflow?.nodes.length) return;
    if (hasManuallySelectedNode && selectedNodeId && workflow.nodes.some((node) => node.id === selectedNodeId)) return;
    const orderedSnapshots = Object.values(selectedRun?.nodeSnapshotsByNodeId ?? {}).sort((left, right) => {
      const leftTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(left) ?? "";
      const rightTimestamp = WorkflowDetailPresenter.getSnapshotTimestamp(right) ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    });
    const nextFocusedNodeId =
      orderedSnapshots.find((snapshot) => snapshot.status === "running")?.nodeId ??
      orderedSnapshots.find((snapshot) => snapshot.status === "queued")?.nodeId ??
      orderedSnapshots[0]?.nodeId ??
      workflow.nodes[0]!.id;
    if (nextFocusedNodeId !== selectedNodeId) {
      setSelectedNodeId(nextFocusedNodeId);
    }
  }, [hasManuallySelectedNode, selectedNodeId, selectedRun, workflow]);

  const selectedNodeSnapshot = useMemo<NodeExecutionSnapshot | undefined>(() => {
    if (!selectedRun || !selectedNodeId) return undefined;
    return selectedRun.nodeSnapshotsByNodeId[selectedNodeId];
  }, [selectedNodeId, selectedRun]);

  const selectedWorkflowNode = useMemo(() => workflow?.nodes.find((node) => node.id === selectedNodeId), [selectedNodeId, workflow]);
  const inputPortEntries = useMemo(() => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.inputsByPort), [selectedNodeSnapshot]);
  const outputPortEntries = useMemo(() => WorkflowDetailPresenter.sortPortEntries(selectedNodeSnapshot?.outputs), [selectedNodeSnapshot]);
  const executionNodes = useMemo(() => WorkflowDetailPresenter.buildExecutionNodes(workflow, selectedRun), [selectedRun, workflow]);
  const executionTreeData = useMemo(() => WorkflowDetailPresenter.buildExecutionTreeData(executionNodes), [executionNodes]);
  const executionTreeExpandedKeys = useMemo(() => WorkflowDetailPresenter.collectExecutionTreeKeys(executionTreeData), [executionTreeData]);

  useEffect(() => {
    setSelectedInputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(inputPortEntries, current));
  }, [inputPortEntries]);

  useEffect(() => {
    setSelectedOutputPort((current) => WorkflowDetailPresenter.resolveSelectedPort(outputPortEntries, current));
  }, [outputPortEntries]);

  useEffect(() => {
    const selectionKey = `${selectedRunId ?? ""}:${selectedNodeId ?? ""}`;
    const nextHasError = Boolean(selectedNodeSnapshot?.error);
    if (previousInspectorSelectionRef.current !== selectionKey) {
      setSelectedTab(WorkflowDetailPresenter.getDefaultInspectorTab(selectedNodeSnapshot));
    } else if (!previousInspectorHasErrorRef.current && nextHasError) {
      setSelectedTab("error");
    }
    previousInspectorSelectionRef.current = selectionKey;
    previousInspectorHasErrorRef.current = nextHasError;
  }, [selectedNodeId, selectedNodeSnapshot, selectedRunId]);

  const onRun = useCallback(() => {
    setIsRunning(true);
    setError(null);
    void WorkflowDetailPresenter.runWorkflow(workflowId)
      .then((result) => {
        if (result.state) {
          queryClient.setQueryData(WorkflowDetailPresenter.getRunQueryKey(result.runId), result.state);
          queryClient.setQueryData(
            WorkflowDetailPresenter.getWorkflowRunsQueryKey(result.workflowId),
            (existing: ReadonlyArray<RunSummary> | undefined) =>
              WorkflowDetailPresenter.mergeRunSummaryList(existing, WorkflowDetailPresenter.toRunSummary(result.state!)),
          );
        }
        setSelectedRunId(result.runId);
        setPendingSelectedRun({
          runId: result.runId,
          workflowId: result.workflowId,
          status: result.state?.status ?? result.status,
          startedAt: result.state?.startedAt ?? result.startedAt ?? new Date().toISOString(),
        });
        setHasManuallySelectedNode(false);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setIsRunning(false));
  }, [queryClient, workflowId]);

  const workflowError = workflowQuery.error instanceof Error ? workflowQuery.error.message : null;
  const runsError = runsQuery.error instanceof Error ? runsQuery.error.message : null;
  const selectedInputItems = useMemo(() => inputPortEntries.find(([portName]) => portName === selectedInputPort)?.[1], [inputPortEntries, selectedInputPort]);
  const selectedOutputItems = useMemo(() => outputPortEntries.find(([portName]) => portName === selectedOutputPort)?.[1], [outputPortEntries, selectedOutputPort]);
  const selectedNodeError = selectedNodeSnapshot?.error;
  const inspectorValue =
    selectedTab === "input"
      ? WorkflowDetailPresenter.toJsonValue(selectedInputItems)
      : selectedTab === "output"
        ? WorkflowDetailPresenter.toJsonValue(selectedOutputItems)
        : undefined;
  const inspectorEmptyLabel =
    selectedTab === "input"
      ? "No input captured yet."
      : selectedTab === "output"
        ? "No output captured yet."
        : "No error for this node.";
  const currentPortEntries = selectedTab === "input" ? inputPortEntries : selectedTab === "output" ? outputPortEntries : [];
  const currentPortSelection = selectedTab === "input" ? selectedInputPort : selectedTab === "output" ? selectedOutputPort : null;

  const runsSection = useMemo(() => {
    if (runsError) return <p style={{ color: "#b91c1c" }}>Failed to load executions: {runsError}</p>;
    if (!displayedRuns) return <p style={{ opacity: 0.7 }}>Loading executions…</p>;
    if (displayedRuns.length === 0) return <p style={{ opacity: 0.7 }}>No executions yet.</p>;
    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {displayedRuns.map((run) => (
          <li key={run.runId}>
            <button
              onClick={() => setSelectedRunId(run.runId)}
              style={{
                width: "100%",
                textAlign: "left",
                border: selectedRunId === run.runId ? "1px solid #2563eb" : "1px solid #d1d5db",
                padding: 10,
                cursor: "pointer",
                background: selectedRunId === run.runId ? "#eff6ff" : "white",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <WorkflowStatusIcon status={run.status} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{run.status}</div>
                </div>
                <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "nowrap" }}>{WorkflowDetailPresenter.formatDateTime(run.startedAt)}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.66, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.runId}</div>
            </button>
          </li>
        ))}
      </ul>
    );
  }, [displayedRuns, runsError, selectedRunId]);

  const inspectorContent = useMemo(() => {
    if (!selectedRunId) return <div style={{ opacity: 0.7 }}>Select an execution to inspect node inputs and outputs.</div>;
    if (selectedRunQuery.isLoading && !selectedRun) return <div style={{ opacity: 0.7 }}>Loading execution details…</div>;
    if (selectedRunQuery.error instanceof Error) return <div style={{ color: "#b91c1c" }}>{selectedRunQuery.error.message}</div>;
    if (!selectedRun || !selectedNodeId) return <div style={{ opacity: 0.7 }}>Select a node to inspect.</div>;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 32%) 1fr", height: "100%", minHeight: 0 }}>
        <div style={{ borderRight: "1px solid #d1d5db", overflow: "auto", padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, opacity: 0.64, textTransform: "uppercase" }}>Execution tree</div>
          <div style={{ marginTop: 10 }}>
            {executionTreeData.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>No node events yet for this execution.</div>
            ) : (
              <Tree<ExecutionTreeNode>
                className="codemation-execution-tree"
                treeData={executionTreeData as ExecutionTreeNode[]}
                showLine
                showIcon={false}
                defaultExpandAll
                expandedKeys={[...executionTreeExpandedKeys]}
                selectable
                selectedKeys={selectedNodeId ? [selectedNodeId] : []}
                onSelect={(_keys, info) => {
                  setHasManuallySelectedNode(true);
                  setSelectedNodeId(String(info.node.key));
                }}
                titleRender={(treeNode) => {
                  const isSelected = treeNode.key === selectedNodeId;
                  const snapshot = treeNode.snapshot;
                  const node = treeNode.workflowNode;
                  const status = snapshot?.status ?? "pending";
                  const FallbackIcon = WorkflowNodeIconResolver.resolveFallback(node?.type ?? "", node?.role);
                  return (
                    <div
                      style={{
                        background: isSelected ? "#eff6ff" : "transparent",
                        padding: "6px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        minWidth: 0,
                        boxShadow: isSelected ? "inset 2px 0 0 #2563eb" : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                        <div style={{ width: 20, height: 20, display: "grid", placeItems: "center", color: "#111827", background: "#f8fafc", flex: "0 0 auto" }}>
                          <FallbackIcon size={14} strokeWidth={1.9} />
                        </div>
                        <WorkflowStatusIcon status={status} size={15} />
                        <div style={{ minWidth: 0, fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {WorkflowDetailPresenter.getNodeDisplayName(node, snapshot?.nodeId ?? null)}
                        </div>
                      </div>
                      <div style={{ flex: "0 0 auto", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", textAlign: "right" }}>
                        {WorkflowDetailPresenter.formatDateTime(WorkflowDetailPresenter.getSnapshotTimestamp(snapshot))}
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, borderBottom: "1px solid #d1d5db" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <WorkflowStatusIcon status={selectedNodeSnapshot?.status ?? "pending"} />
                <div style={{ fontWeight: 800, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {WorkflowDetailPresenter.getNodeDisplayName(selectedWorkflowNode, selectedNodeId)}
                </div>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                {WorkflowDetailPresenter.formatDateTime(WorkflowDetailPresenter.getSnapshotTimestamp(selectedNodeSnapshot))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["input", "output", "error"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  style={{
                    border: selectedTab === tab ? "1px solid #111827" : "1px solid #d1d5db",
                    background: selectedTab === tab ? "#111827" : "white",
                    color: selectedTab === tab ? "white" : "#111827",
                    padding: "7px 11px",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {tab[0]!.toUpperCase()}
                  {tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {selectedTab !== "error" && currentPortEntries.length > 1 ? (
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: "#f8fafc", overflow: "auto" }}>
              {currentPortEntries.map(([portName]) => {
                const isSelected = currentPortSelection === portName;
                return (
                  <button
                    key={portName}
                    onClick={() => {
                      if (selectedTab === "input") setSelectedInputPort(portName);
                      if (selectedTab === "output") setSelectedOutputPort(portName);
                    }}
                    style={{
                      whiteSpace: "nowrap",
                      border: isSelected ? "1px solid #111827" : "1px solid #d1d5db",
                      background: isSelected ? "#111827" : "white",
                      color: isSelected ? "white" : "#111827",
                      padding: "6px 10px",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {portName}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div style={{ overflow: "auto", padding: 12 }}>
            {selectedTab === "error" ? (
              <WorkflowInspectorErrorView error={selectedNodeError} emptyLabel={inspectorEmptyLabel} />
            ) : (
              <WorkflowInspectorJsonView value={inspectorValue} emptyLabel={inspectorEmptyLabel} />
            )}
          </div>
        </div>
      </div>
    );
  }, [
    currentPortEntries,
    currentPortSelection,
    executionNodes.length,
    executionTreeExpandedKeys,
    executionTreeData,
    inspectorEmptyLabel,
    inspectorValue,
    selectedNodeError,
    selectedNodeId,
    selectedNodeSnapshot,
    selectedRun,
    selectedRunId,
    selectedRunQuery.error,
    selectedRunQuery.isLoading,
    selectedTab,
    selectedWorkflowNode,
  ]);

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", height: "100vh", width: "100vw", minHeight: 0, overflow: "hidden", background: "#f8fafc" }}>
      <section style={{ height: "100%", width: "100%", minHeight: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "320px 1fr" }}>
        <aside style={{ height: "100%", minHeight: 0, overflow: "hidden", borderRight: "1px solid #d1d5db", background: "#fff", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: 14, borderBottom: "1px solid #d1d5db" }}>
            <Link to="/workflows" style={{ opacity: 0.8, fontSize: 13, color: "#2563eb", textDecoration: "none" }}>
              ← Workflows
            </Link>
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>{workflow?.name ?? "Workflow"}</div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.68, wordBreak: "break-all" }}>{workflowId}</div>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={onRun}
                disabled={isRunning}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
                  fontWeight: 800,
                  fontSize: 13,
                  opacity: isRunning ? 0.8 : 1,
                  cursor: isRunning ? "not-allowed" : "pointer",
                }}
              >
                {isRunning ? "Running…" : "Run workflow"}
              </button>
            </div>
            {error || workflowError ? <div style={{ marginTop: 10, fontSize: 13, color: "#b91c1c" }}>Error: {error ?? workflowError}</div> : null}
          </div>

          <div style={{ padding: 14, borderBottom: "1px solid #d1d5db", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.72 }}>Executions</div>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{displayedRuns?.length ?? "…"}</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14 }}>{runsSection}</div>
        </aside>

        <div style={{ height: "100%", minWidth: 0, minHeight: 0, background: "#f8fafc", display: "grid", gridTemplateRows: isPanelCollapsed ? "minmax(0, 1fr) 36px" : `minmax(0, 1fr) ${inspectorHeight}px` }}>
          <div style={{ height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", background: "#f8fafc" }}>
            {workflow ? (
              <WorkflowCanvas
                workflow={workflow}
                nodeSnapshotsByNodeId={selectedRun?.nodeSnapshotsByNodeId ?? {}}
                selectedNodeId={selectedNodeId}
                onSelectNode={(nodeId) => {
                  setHasManuallySelectedNode(true);
                  setSelectedNodeId(nodeId);
                }}
              />
            ) : (
              <div style={{ padding: 16, opacity: 0.8 }}>Loading diagram…</div>
            )}
          </div>

          <div style={{ minHeight: 0, background: "white", display: "grid", gridTemplateRows: isPanelCollapsed ? "36px" : "36px minmax(0, 1fr)", borderTop: "1px solid #d1d5db" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "0 10px 0 12px",
                cursor: "ns-resize",
                userSelect: "none",
                borderBottom: isPanelCollapsed ? "none" : "1px solid #e5e7eb",
                background: "#fff",
              }}
              onMouseDown={(event) => {
                if (isPanelCollapsed) return;
                resizeStartYRef.current = event.clientY;
                resizeStartHeightRef.current = inspectorHeight;
                setIsInspectorResizing(true);
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.72 }}>Execution inspector</div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setIsPanelCollapsed((value) => !value);
                }}
                aria-label={isPanelCollapsed ? "Open execution inspector" : "Collapse execution inspector"}
                style={{
                  width: 28,
                  height: 28,
                  border: "1px solid #9ca3af",
                  outline: "1px solid #e5e7eb",
                  outlineOffset: "-2px",
                  background: "white",
                  color: "#111827",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                {isPanelCollapsed ? <PanelBottomOpen size={15} strokeWidth={1.9} /> : <PanelBottomClose size={15} strokeWidth={1.9} />}
              </button>
            </div>
            {!isPanelCollapsed ? <div style={{ minHeight: 0, overflow: "hidden" }}>{inspectorContent}</div> : null}
          </div>
        </div>
      </section>
      <style>{`
        @keyframes codemationSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .codemation-execution-tree {
          background: transparent;
          border: none;
        }

        .codemation-execution-tree .rc-tree-node-content-wrapper {
          display: inline-block;
          width: calc(100% - 18px);
          height: auto;
          padding: 0;
          line-height: 1.2;
          vertical-align: top;
        }

        .codemation-execution-tree .rc-tree-switcher {
          width: 12px;
          margin-right: 6px;
        }

        .codemation-execution-tree .rc-tree-treenode {
          padding: 0 0 4px;
          line-height: normal;
          white-space: nowrap;
        }

        .codemation-execution-tree .rc-tree-title {
          display: block;
          width: 100%;
        }

        .codemation-execution-tree .rc-tree-treenode ul {
          padding-left: 20px;
        }

        .codemation-execution-tree .rc-tree-node-selected {
          background: transparent;
          box-shadow: none;
          opacity: 1;
        }

        .codemation-execution-tree .rc-tree-node-content-wrapper:hover {
          background: transparent;
        }
      `}</style>
    </main>
  );
}
