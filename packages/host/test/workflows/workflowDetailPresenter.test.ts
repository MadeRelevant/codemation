import { ConnectionNodeIdFactory } from "@codemation/core";
import type { ConnectionInvocationRecord } from "@codemation/next-host/src/features/workflows/lib/realtime/realtimeDomainTypes";
import { WorkflowDetailPresenter } from "@codemation/next-host/src/features/workflows/lib/workflowDetail/WorkflowDetailPresenter";
import type { ExecutionTreeNode } from "@codemation/next-host/src/features/workflows/lib/workflowDetail/workflowDetailTypes";
import { describe, expect, it } from "vitest";
import { WorkflowDetailFixtureFactory } from "../workflowDetail/testkit";

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
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify({ changed: true }))).toEqual([
      { json: { changed: true } },
    ]);
    expect(
      WorkflowDetailPresenter.parseEditableItems(JSON.stringify({ json: { alreadyWrappedSingle: true } })),
    ).toEqual([{ json: { alreadyWrappedSingle: true } }]);
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify([{ first: true }, { second: true }]))).toEqual([
      { json: { first: true } },
      { json: { second: true } },
    ]);
    expect(WorkflowDetailPresenter.parseEditableItems(JSON.stringify([{ json: { alreadyWrapped: true } }]))).toEqual([
      { json: { alreadyWrapped: true } },
    ]);
  });

  it("exposes pinned output helpers and editable json", () => {
    const run = WorkflowDetailFixtureFactory.createPinnedMutableRunStateForNode(
      WorkflowDetailFixtureFactory.triggerNodeId,
    );

    expect(WorkflowDetailPresenter.getExecutionModeLabel(run)).toBe("Manual");
    expect(
      WorkflowDetailPresenter.getPinnedOutputForPort(run, WorkflowDetailFixtureFactory.triggerNodeId, "main"),
    ).toEqual([{ json: { pinned: true } }]);
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

    expect(
      executionNodes.some((entry) => entry.node.id === WorkflowDetailFixtureFactory.llmFirstInvocationNodeId),
    ).toBe(true);
    expect(
      executionNodes.some((entry) => entry.node.id === WorkflowDetailFixtureFactory.toolFirstInvocationNodeId),
    ).toBe(true);
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

  it("maps canvas LLM node id to the newest invocation snapshot for inspector selection", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const run = WorkflowDetailFixtureFactory.createCompletedRunState({ workflow });

    const resolved = WorkflowDetailPresenter.resolveInspectorNodeIdForCanvasPick(
      WorkflowDetailFixtureFactory.llmNodeId,
      workflow,
      run.nodeSnapshotsByNodeId,
      run.connectionInvocations,
    );

    expect(resolved).toBe(WorkflowDetailFixtureFactory.llmNodeId);
  });

  it("dedupes duplicate connection invocation ids by keeping the newest updatedAt row", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const base = WorkflowDetailFixtureFactory.createCompletedRunState({ workflow });
    const connectionInvocations: ConnectionInvocationRecord[] = [
      {
        invocationId: "cinv_dup",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedInput: { prompts: 1 },
        managedOutput: { text: "older" },
        updatedAt: "2026-03-11T12:00:05.000Z",
      },
      {
        invocationId: "cinv_dup",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedInput: { prompts: 1 },
        managedOutput: { text: "newer" },
        updatedAt: "2026-03-11T12:00:10.000Z",
      },
    ];
    const run = { ...base, connectionInvocations };
    const executionNodes = WorkflowDetailPresenter.buildExecutionNodes(workflow, run);
    const llmRows = executionNodes.filter(
      (entry) => entry.workflowConnectionNodeId === WorkflowDetailFixtureFactory.llmNodeId,
    );
    expect(llmRows).toHaveLength(1);
    expect(llmRows[0]?.snapshot?.outputs?.main?.[0]?.json).toEqual({ text: "newer" });
  });

  it("uses connection invocation history for repeated LLM rows and picks the latest for canvas selection", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const base = WorkflowDetailFixtureFactory.createCompletedRunState({ workflow });
    const connectionInvocations: ConnectionInvocationRecord[] = [
      {
        invocationId: "cinv_llm_1",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedInput: { prompts: 1 },
        managedOutput: { text: "a" },
        updatedAt: "2026-03-11T12:00:05.000Z",
      },
      {
        invocationId: "cinv_llm_2",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedInput: { prompts: 2 },
        managedOutput: { text: "b" },
        updatedAt: "2026-03-11T12:00:10.000Z",
      },
    ];
    const run = { ...base, connectionInvocations };

    const executionNodes = WorkflowDetailPresenter.buildExecutionNodes(workflow, run);
    const llmRows = executionNodes.filter(
      (entry) => entry.workflowConnectionNodeId === WorkflowDetailFixtureFactory.llmNodeId,
    );
    expect(llmRows.map((entry) => entry.node.id)).toEqual(["cinv_llm_1", "cinv_llm_2"]);

    const resolved = WorkflowDetailPresenter.resolveInspectorNodeIdForCanvasPick(
      WorkflowDetailFixtureFactory.llmNodeId,
      workflow,
      run.nodeSnapshotsByNodeId,
      run.connectionInvocations,
    );
    expect(resolved).toBe("cinv_llm_2");

    expect(
      WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow(
        "cinv_llm_1",
        workflow,
        run.connectionInvocations,
      ),
    ).toBe(true);
  });

  it("treats connection LLM node ids as anchored to displayed workflow nodes for manual selection", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();

    expect(
      WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow(
        WorkflowDetailFixtureFactory.llmFirstInvocationNodeId,
        workflow,
      ),
    ).toBe(true);

    expect(WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow("unknown::nope", workflow)).toBe(false);
  });

  it("resolves connection invocation ids to workflow node ids for canvas highlight and properties panel", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const connectionInvocations: ConnectionInvocationRecord[] = [
      {
        invocationId: "cinv_llm_highlight",
        runId: "run-1",
        workflowId: workflow.id,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        updatedAt: "2026-03-11T12:00:05.000Z",
      },
    ];
    expect(
      WorkflowDetailPresenter.resolveCanvasWorkflowNodeIdForHighlight(
        WorkflowDetailFixtureFactory.llmNodeId,
        workflow,
        connectionInvocations,
      ),
    ).toBe(WorkflowDetailFixtureFactory.llmNodeId);
    expect(
      WorkflowDetailPresenter.resolveCanvasWorkflowNodeIdForHighlight(
        "cinv_llm_highlight",
        workflow,
        connectionInvocations,
      ),
    ).toBe(WorkflowDetailFixtureFactory.llmNodeId);
    expect(
      WorkflowDetailPresenter.resolveCanvasWorkflowNodeIdForHighlight(null, workflow, connectionInvocations),
    ).toBeNull();
  });

  it("nests execution tree rows for deep agent connection chains (coordinator → nested agent → inner tool)", () => {
    const workflow = WorkflowDetailFixtureFactory.createNestedAgentCoordinatorWorkflowDetail();
    const run = WorkflowDetailFixtureFactory.createNestedAgentCoordinatorCompletedRunState(workflow);
    const executionNodes = WorkflowDetailPresenter.buildExecutionNodes(workflow, run);
    const tree = WorkflowDetailPresenter.buildExecutionTreeData(executionNodes);
    const rootIds = tree.map((n) => n.workflowNode?.id);

    expect(rootIds).toContain(WorkflowDetailFixtureFactory.triggerNodeId);
    expect(rootIds).toContain(WorkflowDetailFixtureFactory.nestedCoordinatorAgentId);
    expect(rootIds).not.toContain(WorkflowDetailFixtureFactory.nestedOuterLlmInvocationId);
    expect(rootIds).not.toContain(WorkflowDetailFixtureFactory.nestedSpecialistInvocationId);
    expect(rootIds).not.toContain(WorkflowDetailFixtureFactory.nestedInnerLlmInvocationId);
    expect(rootIds).not.toContain(WorkflowDetailFixtureFactory.nestedInnerToolInvocationId);

    const agentRoot = tree.find((n) => n.workflowNode?.id === WorkflowDetailFixtureFactory.nestedCoordinatorAgentId);
    expect(agentRoot).toBeDefined();

    const specialistChild = (agentRoot?.children as ExecutionTreeNode[] | undefined)?.find(
      (c) => c.workflowNode?.id === WorkflowDetailFixtureFactory.nestedSpecialistInvocationId,
    );
    expect(specialistChild).toBeDefined();

    const specialistChildren = (specialistChild?.children ?? []) as ExecutionTreeNode[];
    expect(
      specialistChildren.some((c) => c.workflowNode?.id === WorkflowDetailFixtureFactory.nestedInnerLlmInvocationId),
    ).toBe(true);
    expect(
      specialistChildren.some((c) => c.workflowNode?.id === WorkflowDetailFixtureFactory.nestedInnerToolInvocationId),
    ).toBe(true);

    const specialistToolWorkflowId = ConnectionNodeIdFactory.toolConnectionNodeId(
      WorkflowDetailFixtureFactory.nestedCoordinatorAgentId,
      WorkflowDetailFixtureFactory.nestedResearchToolName,
    );
    const innerToolWorkflowId = ConnectionNodeIdFactory.toolConnectionNodeId(
      specialistToolWorkflowId,
      WorkflowDetailFixtureFactory.nestedInnerLookupToolName,
    );
    expect(WorkflowDetailPresenter.resolveExecutionTreeKeyForNodeId(executionNodes, innerToolWorkflowId)).toBe(
      WorkflowDetailFixtureFactory.nestedInnerToolInvocationId,
    );
  });

  it("places two distinct LLM invocations under the agent in the execution tree", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const base = WorkflowDetailFixtureFactory.createCompletedRunState({ workflow });
    const connectionInvocations: ConnectionInvocationRecord[] = [
      {
        invocationId: "cinv_llm_a",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedInput: { prompts: 1 },
        managedOutput: { text: "a" },
        updatedAt: "2026-03-11T12:00:05.000Z",
      },
      {
        invocationId: "cinv_llm_b",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedInput: { prompts: 2 },
        managedOutput: { text: "b" },
        updatedAt: "2026-03-11T12:00:10.000Z",
      },
    ];
    const run = { ...base, connectionInvocations };
    const executionNodes = WorkflowDetailPresenter.buildExecutionNodes(workflow, run);
    const tree = WorkflowDetailPresenter.buildExecutionTreeData(executionNodes);
    const agentRoot = tree.find((n) => n.workflowNode?.id === WorkflowDetailFixtureFactory.agentNodeId);
    const childRoles = (agentRoot?.children as typeof tree | undefined)?.map((c) => c.workflowNode?.role) ?? [];
    const llmChildren = childRoles.filter((r) => r === "languageModel");
    expect(llmChildren).toHaveLength(2);
  });

  it("normalizes duplicate connection invocation ids to the newest row", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const base = WorkflowDetailFixtureFactory.createCompletedRunState({ workflow });
    const connectionInvocations: ConnectionInvocationRecord[] = [
      {
        invocationId: "cinv_same",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedOutput: { text: "older" },
        updatedAt: "2026-03-11T12:00:05.000Z",
      },
      {
        invocationId: "cinv_same",
        runId: base.runId,
        workflowId: base.workflowId,
        connectionNodeId: WorkflowDetailFixtureFactory.llmNodeId,
        parentAgentNodeId: WorkflowDetailFixtureFactory.agentNodeId,
        parentAgentActivationId: "act_main",
        status: "completed",
        managedOutput: { text: "newer" },
        updatedAt: "2026-03-11T12:00:10.000Z",
      },
    ];
    const normalized = WorkflowDetailPresenter.normalizeConnectionInvocations(connectionInvocations);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.managedOutput).toEqual({ text: "newer" });
  });

  it("resolves credential attention for unbound required slots", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
    const result = WorkflowDetailPresenter.resolveCredentialAttention({
      workflow,
      slots: [
        {
          workflowId: workflow.id,
          nodeId: "node_needs_cred",
          nodeName: "Cred node",
          requirement: { slotKey: "api", label: "API key", acceptedTypes: ["openai.apiKey"] },
          health: { status: "unbound" },
        },
      ],
    });
    expect(result.attentionNodeIds.has("node_needs_cred")).toBe(true);
    expect(result.summaryLines[0]).toContain("Cred node");
    expect(result.summaryLines[0]).toContain("API key");
  });
});
