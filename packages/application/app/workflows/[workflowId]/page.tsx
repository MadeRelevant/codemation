"use client";

import JsonView from "@uiw/react-json-view";
import { githubLightTheme } from "@uiw/react-json-view/githubLight";
import { format, isToday, isYesterday } from "date-fns";
import { CircleAlert, CircleCheckBig, Clock3, LoaderCircle, PanelBottomClose, PanelBottomOpen } from "lucide-react";
import Link from "next/link";
import Tree, { type FieldDataNode } from "rc-tree";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRunQuery,
  useWorkflowQuery,
  useWorkflowRealtimeSubscription,
  useWorkflowRunsQuery,
  type Items,
  type NodeExecutionSnapshot,
  type PersistedRunState,
  type WorkflowDto,
} from "../../_realtime/realtime";
import { WorkflowCanvas } from "./WorkflowCanvas";

type RunWorkflowResult = Readonly<{ runId: string; workflowId: string; status: string }>;
type InspectorTab = "input" | "output" | "error";
type CopyState = "idle" | "copied";
type PortEntries = ReadonlyArray<readonly [string, Items]>;
type WorkflowNode = WorkflowDto["nodes"][number];
type ExecutionNode = Readonly<{ node: WorkflowNode; snapshot: NodeExecutionSnapshot }>;
type ExecutionTreeNode = FieldDataNode<
  Readonly<{
    key: string;
    title?: string;
    workflowNode?: WorkflowNode;
    snapshot?: NodeExecutionSnapshot;
  }>
>;

class WorkflowDetailPagePresenter {
  static async runWorkflow(workflowId: string): Promise<RunWorkflowResult> {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId, items: [{ json: {} }] }),
    });
    if (!response.ok) throw new Error(await response.text());
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
    return entries[0]![0];
  }

  static toJsonValue(items: Items | undefined): unknown {
    if (!items || items.length === 0) return undefined;
    const jsonValues = items.map((item) => item.json);
    return jsonValues.length === 1 ? jsonValues[0] : jsonValues;
  }

  static buildExecutionNodes(workflow: WorkflowDto | undefined, selectedRun: PersistedRunState | undefined): ReadonlyArray<ExecutionNode> {
    if (!workflow || !selectedRun) return [];
    return workflow.nodes
      .map((node) => {
        const snapshot = selectedRun.nodeSnapshotsByNodeId[node.id];
        return snapshot ? { node, snapshot } : null;
      })
      .filter((value): value is ExecutionNode => value !== null)
      .sort((left, right) => {
        const leftTimestamp = this.getSnapshotTimestamp(left.snapshot) ?? "";
        const rightTimestamp = this.getSnapshotTimestamp(right.snapshot) ?? "";
        return leftTimestamp.localeCompare(rightTimestamp);
      });
  }

  static buildExecutionTreeData(nodes: ReadonlyArray<ExecutionNode>): ReadonlyArray<ExecutionTreeNode> {
    return nodes.map(({ node, snapshot }) => ({
      key: node.id,
      title: node.name ?? node.type ?? node.id,
      workflowNode: node,
      snapshot,
      isLeaf: true,
    }));
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
          <button
            onClick={() => setCollapsedLevel(true)}
            style={{ border: "1px solid #d1d5db", borderRadius: 0, background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
          >
            Collapse all
          </button>
          <button
            onClick={() => setCollapsedLevel(false)}
            style={{ border: "1px solid #d1d5db", borderRadius: 0, background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
          >
            Expand all
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{copyState === "copied" ? "Copied to clipboard" : "Use the copy icon in the viewer"}</div>
      </div>
      <div
        style={{
          overflow: "auto",
          border: "1px solid #d1d5db",
          borderRadius: 0,
          background: "#f8fafc",
          padding: 12,
        }}
      >
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
              borderRadius: 0,
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
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.6,
              color: "#111827",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export default function WorkflowDetailPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const MIN_INSPECTOR_HEIGHT = 240;
  const MAX_INSPECTOR_HEIGHT = 640;
  const { workflowId: rawWorkflowId } = use(params);
  const workflowId = decodeURIComponent(rawWorkflowId);
  const workflowQuery = useWorkflowQuery(workflowId);
  const runsQuery = useWorkflowRunsQuery(workflowId);
  const workflow = workflowQuery.data;
  const runs = runsQuery.data;

  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasManuallySelectedNode, setHasManuallySelectedNode] = useState(false);
  const [selectedTab, setSelectedTab] = useState<InspectorTab>("output");
  const [selectedInputPort, setSelectedInputPort] = useState<string | null>(null);
  const [selectedOutputPort, setSelectedOutputPort] = useState<string | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [inspectorHeight, setInspectorHeight] = useState(320);
  const [isInspectorResizing, setIsInspectorResizing] = useState(false);
  const resizeStartYRef = useRef<number | null>(null);
  const resizeStartHeightRef = useRef<number>(320);
  const previousInspectorSelectionRef = useRef<string>("");
  const previousInspectorHasErrorRef = useRef(false);

  useWorkflowRealtimeSubscription(workflowId);
  const selectedRunQuery = useRunQuery(selectedRunId);
  const selectedRun = selectedRunQuery.data;

  const onRun = useCallback(() => {
    setIsRunning(true);
    setError(null);
    void WorkflowDetailPagePresenter.runWorkflow(workflowId)
      .then(async (result) => {
        setSelectedRunId(result.runId);
        setHasManuallySelectedNode(false);
        await runsQuery.refetch();
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setIsRunning(false));
  }, [runsQuery, workflowId]);

  useEffect(() => {
    if (!selectedRunId && runs && runs.length > 0) setSelectedRunId(runs[0]!.runId);
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId || !runs?.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(runs?.[0]?.runId ?? null);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    setHasManuallySelectedNode(false);
  }, [selectedRunId]);

  useEffect(() => {
    setSelectedRunId(null);
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
      const leftTimestamp = WorkflowDetailPagePresenter.getSnapshotTimestamp(left) ?? "";
      const rightTimestamp = WorkflowDetailPagePresenter.getSnapshotTimestamp(right) ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    });
    const nextFocusedNodeId =
      orderedSnapshots.find((snapshot) => snapshot.status === "running")?.nodeId ??
      orderedSnapshots.find((snapshot) => snapshot.status === "queued")?.nodeId ??
      orderedSnapshots[0]?.nodeId ??
      workflow.nodes[0]!.id;

    if (nextFocusedNodeId !== selectedNodeId) setSelectedNodeId(nextFocusedNodeId);
  }, [hasManuallySelectedNode, selectedNodeId, selectedRun, workflow]);

  const selectedNodeSnapshot = useMemo<NodeExecutionSnapshot | undefined>(() => {
    if (!selectedRun || !selectedNodeId) return undefined;
    return selectedRun.nodeSnapshotsByNodeId[selectedNodeId];
  }, [selectedNodeId, selectedRun]);

  const selectedWorkflowNode = useMemo(() => workflow?.nodes.find((node) => node.id === selectedNodeId), [selectedNodeId, workflow]);
  const inputPortEntries = useMemo(() => WorkflowDetailPagePresenter.sortPortEntries(selectedNodeSnapshot?.inputsByPort), [selectedNodeSnapshot]);
  const outputPortEntries = useMemo(() => WorkflowDetailPagePresenter.sortPortEntries(selectedNodeSnapshot?.outputs), [selectedNodeSnapshot]);
  const executionNodes = useMemo(() => WorkflowDetailPagePresenter.buildExecutionNodes(workflow, selectedRun), [selectedRun, workflow]);
  const executionTreeData = useMemo(() => WorkflowDetailPagePresenter.buildExecutionTreeData(executionNodes), [executionNodes]);

  useEffect(() => {
    setSelectedInputPort((current) => WorkflowDetailPagePresenter.resolveSelectedPort(inputPortEntries, current));
  }, [inputPortEntries]);

  useEffect(() => {
    setSelectedOutputPort((current) => WorkflowDetailPagePresenter.resolveSelectedPort(outputPortEntries, current));
  }, [outputPortEntries]);

  useEffect(() => {
    const selectionKey = `${selectedRunId ?? ""}:${selectedNodeId ?? ""}`;
    const nextHasError = Boolean(selectedNodeSnapshot?.error);
    if (previousInspectorSelectionRef.current !== selectionKey) {
      setSelectedTab(WorkflowDetailPagePresenter.getDefaultInspectorTab(selectedNodeSnapshot));
    } else if (!previousInspectorHasErrorRef.current && nextHasError) {
      setSelectedTab("error");
    }
    previousInspectorSelectionRef.current = selectionKey;
    previousInspectorHasErrorRef.current = nextHasError;
  }, [selectedNodeId, selectedNodeSnapshot, selectedRunId]);

  const workflowError = workflowQuery.error instanceof Error ? workflowQuery.error.message : null;
  const runsError = runsQuery.error instanceof Error ? runsQuery.error.message : null;

  const selectedInputItems = useMemo(() => inputPortEntries.find(([portName]) => portName === selectedInputPort)?.[1], [inputPortEntries, selectedInputPort]);
  const selectedOutputItems = useMemo(() => outputPortEntries.find(([portName]) => portName === selectedOutputPort)?.[1], [outputPortEntries, selectedOutputPort]);

  const inspectorValue =
    selectedTab === "input"
      ? WorkflowDetailPagePresenter.toJsonValue(selectedInputItems)
      : selectedTab === "output"
        ? WorkflowDetailPagePresenter.toJsonValue(selectedOutputItems)
        : selectedNodeSnapshot?.error;

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
    if (!runs) return <p style={{ opacity: 0.7 }}>Loading executions…</p>;
    if (runs.length === 0) return <p style={{ opacity: 0.7 }}>No executions yet.</p>;
    return (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {runs.map((run) => (
          <li key={run.runId}>
            <button
              onClick={() => setSelectedRunId(run.runId)}
              style={{
                width: "100%",
                textAlign: "left",
                border: selectedRunId === run.runId ? "1px solid #2563eb" : "1px solid #d1d5db",
                borderRadius: 0,
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
                <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "nowrap" }}>{WorkflowDetailPagePresenter.formatDateTime(run.startedAt)}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    );
  }, [runs, runsError, selectedRunId]);

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
            {executionNodes.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>No node events yet for this execution.</div>
            ) : (
              <Tree<ExecutionTreeNode>
                className="codemation-execution-tree"
                treeData={executionTreeData as ExecutionTreeNode[]}
                showLine
                showIcon={false}
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
                  return (
                    <div
                      style={{
                        border: "none",
                        background: isSelected ? "#eff6ff" : "transparent",
                        borderRadius: 0,
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
                        <WorkflowStatusIcon status={status} size={15} />
                        <div style={{ minWidth: 0, fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {WorkflowDetailPagePresenter.getNodeDisplayName(node, snapshot?.nodeId ?? null)}
                        </div>
                      </div>
                      <div style={{ flex: "0 0 auto", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", textAlign: "right" }}>
                        {WorkflowDetailPagePresenter.formatDateTime(WorkflowDetailPagePresenter.getSnapshotTimestamp(snapshot))}
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
                  {WorkflowDetailPagePresenter.getNodeDisplayName(selectedWorkflowNode, selectedNodeId)}
                </div>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                {WorkflowDetailPagePresenter.formatDateTime(WorkflowDetailPagePresenter.getSnapshotTimestamp(selectedNodeSnapshot))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["input", "output", "error"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  style={{
                    borderRadius: 0,
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
                      borderRadius: 0,
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
            <WorkflowInspectorJsonView value={inspectorValue} emptyLabel={inspectorEmptyLabel} />
          </div>
        </div>
      </div>
    );
  }, [
    currentPortEntries,
    currentPortSelection,
    executionNodes.length,
    executionTreeData,
    inspectorEmptyLabel,
    inspectorValue,
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
        <aside
          style={{
            height: "100%",
            minHeight: 0,
            overflow: "hidden",
            borderRight: "1px solid #d1d5db",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <div style={{ padding: 14, borderBottom: "1px solid #d1d5db" }}>
            <Link href="/workflows" style={{ opacity: 0.8, fontSize: 13 }}>
              ← Workflows
            </Link>
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
              {workflow?.name ?? "Workflow"}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.68, wordBreak: "break-all" }}>{workflowId}</div>

            <div style={{ marginTop: 12 }}>
              <button
                onClick={onRun}
                disabled={isRunning}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 0,
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
            <span style={{ fontSize: 12, opacity: 0.7 }}>{runs?.length ?? "…"}</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14 }}>{runsSection}</div>
        </aside>

        <div
          style={{
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            background: "#f8fafc",
            display: "grid",
            gridTemplateRows: isPanelCollapsed ? "minmax(0, 1fr) 36px" : `minmax(0, 1fr) ${inspectorHeight}px`,
          }}
        >
          <div style={{ height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", background: "#f8fafc" }}>
            {workflow ? (
              <WorkflowCanvas
                workflow={workflow as WorkflowDto}
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
                cursor: isPanelCollapsed ? "pointer" : isInspectorResizing ? "ns-resize" : "ns-resize",
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
                  borderRadius: 0,
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
      <style jsx global>{`
        @keyframes codemationSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
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
