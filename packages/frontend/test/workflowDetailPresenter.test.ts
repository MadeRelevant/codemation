import { describe, expect, it } from "vitest";
import { WorkflowDetailPresenter } from "../src/ui/workflowDetail/WorkflowDetailPresenter";
import { WorkflowDetailFixtureFactory } from "./workflowDetail/testkit";

describe("WorkflowDetailPresenter", () => {
  it("creates default run items for manual workflows and no items for webhook workflows", () => {
    const manualWorkflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const webhookWorkflow = WorkflowDetailFixtureFactory.createWorkflowDetail({
      triggerKind: "webhook",
      workflowName: "Frontend webhook workflow",
    });

    expect(WorkflowDetailPresenter.createRunItems(manualWorkflow)).toEqual([{ json: {} }]);
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
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify([{ first: true }, { second: true }]))).toEqual([
      { json: { first: true } },
      { json: { second: true } },
    ]);
  });

  it("exposes mutable execution helpers and editable json", () => {
    const run = WorkflowDetailFixtureFactory.createPinnedMutableRunStateForNode(WorkflowDetailFixtureFactory.triggerNodeId);

    expect(WorkflowDetailPresenter.getExecutionModeLabel(run)).toBe("Manual");
    expect(WorkflowDetailPresenter.isMutableExecution(run)).toBe(true);
    expect(WorkflowDetailPresenter.getPinnedInput(run, WorkflowDetailFixtureFactory.triggerNodeId)).toEqual([{ json: { pinned: true } }]);
    expect(WorkflowDetailPresenter.toEditableJson([{ json: { pinned: true } }])).toContain('"pinned": true');
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
});
