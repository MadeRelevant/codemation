import { describe, expect, it } from "vitest";
import { WorkflowDetailPresenter } from "../src/ui/workflowDetail/WorkflowDetailPresenter";
import { WorkflowDetailFixtureFactory } from "./workflowDetail/testkit";

describe("WorkflowDetailPresenter", () => {
  it("creates no default run items for trigger-started workflows", () => {
    const manualWorkflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const webhookWorkflow = WorkflowDetailFixtureFactory.createWorkflowDetail({
      triggerKind: "webhook",
      workflowName: "Frontend webhook workflow",
    });

    expect(WorkflowDetailPresenter.createRunItems(manualWorkflow)).toEqual([]);
    expect(WorkflowDetailPresenter.createRunItems(webhookWorkflow)).toEqual([]);
  });

  it("sorts ports with main first and keeps a valid selected port", () => {
    const entries = WorkflowDetailPresenter.sortPortEntries({
      beta: [{ json: { beta: true } }],
      main: [{ json: { main: true } }],
      alpha: [],
    });

    expect(entries.map(([name]) => name)).toEqual(["main", "alpha", "beta"]);
    expect(WorkflowDetailPresenter.resolveSelectedPort(entries, "beta")).toBe("beta");
    expect(WorkflowDetailPresenter.resolveSelectedPort(entries, "missing")).toBe("main");
  });

  it("serializes editable items from objects and arrays", () => {
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify({ changed: true }))).toEqual([{ json: { changed: true } }]);
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify({ json: { alreadyWrappedSingle: true } }))).toEqual([
      { json: { alreadyWrappedSingle: true } },
    ]);
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify([{ first: true }, { second: true }]))).toEqual([
      { json: { first: true } },
      { json: { second: true } },
    ]);
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify([{ json: { alreadyWrapped: true } }]))).toEqual([
      { json: { alreadyWrapped: true } },
    ]);
  });

  it("exposes pinned output helpers and editable json", () => {
    const run = WorkflowDetailFixtureFactory.createPinnedMutableRunStateForNode(WorkflowDetailFixtureFactory.triggerNodeId);

    expect(WorkflowDetailPresenter.getExecutionModeLabel(run)).toBe("Manual");
    expect(WorkflowDetailPresenter.getPinnedOutput(run, WorkflowDetailFixtureFactory.triggerNodeId)).toEqual([{ json: { pinned: true } }]);
    expect(WorkflowDetailPresenter.toEditableJson([{ json: { pinned: true } }])).toContain('"pinned": true');
  });

  it("formats snapshot durations with readable units", () => {
    expect(
      WorkflowDetailPresenter.formatDurationLabel({
        runId: "run-1",
        workflowId: "wf-1",
        nodeId: "node-1",
        status: "completed",
        startedAt: "2026-03-17T09:00:00.000Z",
        finishedAt: "2026-03-17T09:01:30.002Z",
        updatedAt: "2026-03-17T09:01:30.002Z",
      }),
    ).toBe("Took 1m 30s 2ms");
  });

  it("builds execution nodes and tree data for agent attachment invocations", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const run = WorkflowDetailFixtureFactory.createCompletedRunState();

    const executionNodes = WorkflowDetailPresenter.buildExecutionNodes(workflow, run);
    const executionTree = WorkflowDetailPresenter.buildExecutionTreeData(executionNodes);
    const executionKeys = WorkflowDetailPresenter.collectExecutionTreeKeys(executionTree);

    expect(executionNodes.some((entry) => entry.node.id === WorkflowDetailFixtureFactory.llmFirstInvocationNodeId)).toBe(true);
    expect(executionNodes.some((entry) => entry.node.id === WorkflowDetailFixtureFactory.toolFirstInvocationNodeId)).toBe(true);
    expect(executionKeys).toContain(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId);
    expect(executionKeys).toContain(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId);
    expect(executionKeys).toContain(WorkflowDetailFixtureFactory.llmSecondInvocationNodeId);
  });

  it("prefers workflow snapshot over live workflow when rendering historical runs", () => {
    const snapshotWorkflow = WorkflowDetailFixtureFactory.createWorkflowDetail({ workflowName: "Historical workflow" });
    const snapshot = WorkflowDetailFixtureFactory.createWorkflowSnapshot({ workflow: snapshotWorkflow });
    const currentWorkflow = WorkflowDetailFixtureFactory.createWorkflowDetail({ workflowName: "Current workflow" });

    const result = WorkflowDetailPresenter.workflowFromSnapshot(snapshot, currentWorkflow);

    expect(result).toBeDefined();
    expect(result?.name).toBe("Historical workflow");
    expect(result?.id).toBe(snapshot.id);
  });

  it("falls back to live workflow when run has no workflow snapshot", () => {
    const currentWorkflow = WorkflowDetailFixtureFactory.createWorkflowDetail({ workflowName: "Current workflow" });

    const result = WorkflowDetailPresenter.workflowFromSnapshot(undefined, currentWorkflow);

    expect(result).toBe(currentWorkflow);
    expect(result?.name).toBe("Current workflow");
  });

  it("only includes queued, running, completed, and failed nodes in the execution tree", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const run = {
      ...WorkflowDetailFixtureFactory.createInitialRunState({
        workflow,
        workflowSnapshot: WorkflowDetailFixtureFactory.createWorkflowSnapshot({ workflow }),
      }),
      nodeSnapshotsByNodeId: {
        [WorkflowDetailFixtureFactory.triggerNodeId]: WorkflowDetailFixtureFactory.createSnapshot(
          WorkflowDetailFixtureFactory.triggerNodeId,
          "queued",
          0,
        ),
        [WorkflowDetailFixtureFactory.nodeOneId]: WorkflowDetailFixtureFactory.createSnapshot(
          WorkflowDetailFixtureFactory.nodeOneId,
          "running",
          1,
        ),
        [WorkflowDetailFixtureFactory.agentNodeId]: WorkflowDetailFixtureFactory.createSnapshot(
          WorkflowDetailFixtureFactory.agentNodeId,
          "completed",
          2,
        ),
        [WorkflowDetailFixtureFactory.nodeTwoId]: WorkflowDetailFixtureFactory.createSnapshot(
          WorkflowDetailFixtureFactory.nodeTwoId,
          "failed",
          3,
        ),
        [WorkflowDetailFixtureFactory.llmNodeId]: WorkflowDetailFixtureFactory.createSnapshot(
          WorkflowDetailFixtureFactory.llmNodeId,
          "pending",
          4,
        ),
        [WorkflowDetailFixtureFactory.toolNodeId]: WorkflowDetailFixtureFactory.createSnapshot(
          WorkflowDetailFixtureFactory.toolNodeId,
          "skipped",
          5,
        ),
      },
    };
    const queuedNodeId = WorkflowDetailFixtureFactory.triggerNodeId;
    const runningNodeId = WorkflowDetailFixtureFactory.nodeOneId;
    const completedNodeId = WorkflowDetailFixtureFactory.agentNodeId;
    const failedNodeId = WorkflowDetailFixtureFactory.nodeTwoId;

    const result = WorkflowDetailPresenter.buildExecutionNodes(workflow, run);

    expect(result.map((entry) => entry.node.id)).toEqual([queuedNodeId, runningNodeId, completedNodeId, failedNodeId]);
  });

  it("includes pinned-output completions in the execution tree", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const run = {
      ...WorkflowDetailFixtureFactory.createInitialRunState({ workflow }),
      nodeSnapshotsByNodeId: {
        [WorkflowDetailFixtureFactory.toolNodeId]: {
          ...WorkflowDetailFixtureFactory.createSnapshot(WorkflowDetailFixtureFactory.toolNodeId, "completed", 5),
          usedPinnedOutput: true,
        },
      },
    };

    const result = WorkflowDetailPresenter.buildExecutionNodes(workflow, run);

    expect(result.map((entry) => entry.node.id)).toEqual([WorkflowDetailFixtureFactory.toolNodeId]);
  });
});
