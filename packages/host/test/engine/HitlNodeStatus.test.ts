/**
 * Unit tests for HITL Story 03: first-class HITL states on node-execution + run terminal status.
 *
 * Scenarios:
 * 1. Approved decision → node status `hitl-approved`, run continues (status "completed").
 * 2. Rejected decision → node status `hitl-rejected`, run status `halted`, reason `hitl-rejected`.
 * 3. Timeout with `onTimeout: "halt"` → `hitl-timeout`, run status `halted`, reason `hitl-timeout`.
 * 4. Timeout with `onTimeout: "auto-accept"` → `hitl-auto-accepted`, run continues.
 * 5. `hitl-cancelled` status round-trips through `NodeExecutionSnapshotFactory` and repository.
 *
 * Scenarios 1–4 exercise `RunContinuationService.resumeFromNodeResult` with a minimal
 * single-node workflow and in-memory repository. Scenario 5 is a type-level persistence
 * test (no engine cancel pathway exists yet in story 03 scope).
 */

import { describe, expect, it } from "vitest";

import type {
  NodeActivationId,
  NodeId,
  NodeInputsByPort,
  NodeOutputs,
  PersistedRunState,
  RunId,
  WorkflowDefinition,
  WorkflowId,
} from "@codemation/core";
import { InMemoryRunDataFactory } from "@codemation/core/bootstrap";

import { RunContinuationService } from "../../../../packages/core/src/orchestration/RunContinuationService";
import { EngineWorkflowPlanningFactory } from "../../../../packages/core/src/planning/EngineWorkflowPlanningFactory";
import { ActivationEnqueueService } from "../../../../packages/core/src/execution/ActivationEnqueueService";
import { NodeEventPublisher } from "../../../../packages/core/src/events/NodeEventPublisher";
import { PersistedRunStateTerminalBuilder } from "../../../../packages/core/src/execution/PersistedRunStateTerminalBuilder";
import { RunStateSemantics } from "../../../../packages/core/src/execution/RunStateSemantics";
import { EngineWaiters } from "../../../../packages/core/src/orchestration/EngineWaiters";
import { MissingRuntimeExecutionMarker } from "../../../../packages/core/src/workflowSnapshots/MissingRuntimeExecutionMarker";
import { NodeExecutionSnapshotFactory } from "../../../../packages/core/src/execution/NodeExecutionSnapshotFactory";
import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";

// ---------------------------------------------------------------------------
// Minimal workflow definition (single HITL node, no downstream edges)
// ---------------------------------------------------------------------------

const wfId = "wf_hitl_test" as WorkflowId;
const nodeId = "hitl_node" as NodeId;
const runId = "run_hitl_1" as RunId;
const activationId = "act_hitl_1" as NodeActivationId;

const minimalWorkflow: WorkflowDefinition = {
  id: wfId,
  name: "HITL Test Workflow",
  nodes: [
    {
      id: nodeId,
      kind: "node",
      type: {} as never,
      config: {} as never,
      name: "HITL Node",
    },
  ],
  edges: [],
};

const inputsByPort: NodeInputsByPort = { in: [{ json: { invoiceId: 42 } }] };

// ---------------------------------------------------------------------------
// Helper: build a RunContinuationService with minimal collaborators.
// Most stubs are no-ops; the repository, terminal builder, and semantics are real.
// ---------------------------------------------------------------------------

function makeService(repo: InMemoryWorkflowRunRepository): RunContinuationService {
  const runDataFactory = new InMemoryRunDataFactory();

  const workflowSnapshotResolver = {
    resolve: (_args: unknown) => minimalWorkflow,
  };

  // Minimal planning: node instances are empty (single-node workflow, no activation needed)
  const nodeInstanceFactory = {
    createByType: (_token: unknown) => undefined,
    createNodes: (_wf: WorkflowDefinition) => new Map(),
  };
  const planningFactory = new EngineWorkflowPlanningFactory(nodeInstanceFactory as never);

  const nodeStatePublisherFactory = {
    create: (_runId: unknown, _workflowId: unknown, _parent: unknown) => ({
      markQueued: async () => {},
      markRunning: async () => {},
      markCompleted: async () => {},
      markFailed: async () => {},
      markSkipped: async () => {},
    }),
  };

  const credentialResolverFactory = {
    create: (_workflowId: unknown, _nodeId: unknown, _config?: unknown) => async () => undefined,
  };

  const runExecutionContextFactory = {
    create: (_args: unknown) => ({}) as never,
  };

  const nodeActivationRequestComposer = {
    createFromPlannedActivation: (_args: unknown) => ({}) as never,
    createSingleFromDefinitionWithActivation: (_args: unknown) => ({}) as never,
    createMultiFromDefinitionWithActivation: (_args: unknown) => ({}) as never,
  };

  const terminalBuilder = new PersistedRunStateTerminalBuilder();

  // ActivationEnqueueService is only called in the non-halt path when there IS a next node.
  // For our single-node workflow, planner.nextActivation returns null → enqueue never called.
  const activationEnqueueService = {
    enqueueActivation: async (_args: unknown) => {
      throw new Error("ActivationEnqueueService.enqueueActivation should not be called in halt tests");
    },
    enqueueActivationWithSnapshot: async (_args: unknown) => {
      throw new Error("ActivationEnqueueService.enqueueActivationWithSnapshot should not be called in halt tests");
    },
  } as unknown as ActivationEnqueueService;

  const nodeEventPublisher = {
    publish: async (_event: unknown, _snapshot: unknown) => {},
  } as unknown as NodeEventPublisher;

  const semantics = new RunStateSemantics(new MissingRuntimeExecutionMarker());

  const waiters = new EngineWaiters();

  const policyErrorServices = {
    resolveNodeErrorHandler: (_config: unknown) => undefined,
    resolveWorkflowErrorHandler: (_handler: unknown) => undefined,
  } as never;

  const terminalPersistence = {
    maybeDeleteAfterTerminalState: async (_args: unknown) => {},
  } as never;

  const executionLimitsPolicy = {
    createRootExecutionOptions: () => ({
      maxNodeActivations: 1000,
      maxSubworkflowDepth: 32,
    }),
    resolveForRun: (_options: unknown) => ({ maxNodeActivations: 1000, maxSubworkflowDepth: 32 }),
  } as never;

  const activationIdFactory = {
    makeActivationId: () => "act_generated" as NodeActivationId,
  } as never;

  return new RunContinuationService(
    activationIdFactory,
    repo,
    runDataFactory,
    runExecutionContextFactory as never,
    workflowSnapshotResolver as never,
    planningFactory,
    nodeStatePublisherFactory as never,
    credentialResolverFactory as never,
    nodeActivationRequestComposer as never,
    terminalBuilder,
    activationEnqueueService,
    nodeEventPublisher,
    semantics,
    waiters,
    policyErrorServices,
    terminalPersistence,
    executionLimitsPolicy,
  );
}

// ---------------------------------------------------------------------------
// Helper: set up a pending run in the repository
// ---------------------------------------------------------------------------

async function createPendingRun(repo: InMemoryWorkflowRunRepository): Promise<void> {
  await repo.createRun({
    runId,
    workflowId: wfId,
    startedAt: new Date().toISOString(),
  });
  // Flip status to "pending" with a pending execution record
  const state = await repo.load(runId);
  await repo.save({
    ...state!,
    status: "pending",
    pending: {
      runId,
      workflowId: wfId,
      activationId,
      nodeId,
      itemsIn: 1,
      inputsByPort,
      receiptId: "receipt_1",
      batchId: "batch_1",
      enqueuedAt: new Date().toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// HITL output helpers: build node output with decision.status as produced by
// defineHumanApprovalNode's handleResume.
// ---------------------------------------------------------------------------

function makeHitlOutput(decisionStatus: "approved" | "rejected" | "timed-out" | "auto-accepted"): NodeOutputs {
  return {
    main: [{ json: { invoiceId: 42, decision: { status: decisionStatus } } }],
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Approved decision → node status `hitl-approved`, run continues
// ---------------------------------------------------------------------------

describe("HITL status resolution in resumeFromNodeResult", () => {
  it("scenario 1: approved → node snapshot hitl-approved, run completes (no downstream)", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await createPendingRun(repo);
    const service = makeService(repo);

    const result = await service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: makeHitlOutput("approved"),
    });

    // Single-node workflow with no edges → run transitions to "completed" after hitl-approved
    expect(result.status).toBe("completed");

    const saved = await repo.load(runId);
    expect(saved?.status).toBe("completed");
    const snapshot = saved?.nodeSnapshotsByNodeId?.[nodeId];
    expect(snapshot?.status).toBe("hitl-approved");
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Rejected decision → node status `hitl-rejected`, run halted
  // ---------------------------------------------------------------------------

  it("scenario 2: rejected → node snapshot hitl-rejected, run status halted, reason hitl-rejected", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await createPendingRun(repo);
    const service = makeService(repo);

    const result = await service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: makeHitlOutput("rejected"),
    });

    expect(result.status).toBe("halted");
    if (result.status === "halted") {
      expect(result.reason).toBe("hitl-rejected");
    }

    const saved = await repo.load(runId);
    expect(saved?.status).toBe("halted");
    expect(saved?.reason).toBe("hitl-rejected");
    const snapshot = saved?.nodeSnapshotsByNodeId?.[nodeId];
    expect(snapshot?.status).toBe("hitl-rejected");
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Timeout with onTimeout: "halt" → `hitl-timeout`, run halted
  // ---------------------------------------------------------------------------

  it("scenario 3: timed-out → node snapshot hitl-timeout, run status halted, reason hitl-timeout", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await createPendingRun(repo);
    const service = makeService(repo);

    const result = await service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: makeHitlOutput("timed-out"),
    });

    expect(result.status).toBe("halted");
    if (result.status === "halted") {
      expect(result.reason).toBe("hitl-timeout");
    }

    const saved = await repo.load(runId);
    expect(saved?.status).toBe("halted");
    expect(saved?.reason).toBe("hitl-timeout");
    const snapshot = saved?.nodeSnapshotsByNodeId?.[nodeId];
    expect(snapshot?.status).toBe("hitl-timeout");
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Timeout with onTimeout: "auto-accept" → `hitl-auto-accepted`, run continues
  // ---------------------------------------------------------------------------

  it("scenario 4: auto-accepted → node snapshot hitl-auto-accepted, run completes (no downstream)", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await createPendingRun(repo);
    const service = makeService(repo);

    const result = await service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: makeHitlOutput("auto-accepted"),
    });

    expect(result.status).toBe("completed");

    const saved = await repo.load(runId);
    expect(saved?.status).toBe("completed");
    const snapshot = saved?.nodeSnapshotsByNodeId?.[nodeId];
    expect(snapshot?.status).toBe("hitl-auto-accepted");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: `hitl-cancelled` type round-trip through snapshot factory + repository.
// No engine cancel pathway exists yet in story 03 scope; this validates the type
// system and persistence layer accept `hitl-cancelled` as a valid node status.
// ---------------------------------------------------------------------------

describe("hitl-cancelled type round-trip", () => {
  it("scenario 5: hitl-cancelled persists and loads via NodeExecutionSnapshotFactory + repository", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({
      runId,
      workflowId: wfId,
      startedAt: new Date().toISOString(),
    });

    const state = (await repo.load(runId))!;
    const finishedAt = new Date().toISOString();
    const cancelledSnapshot = NodeExecutionSnapshotFactory.completed({
      runId,
      workflowId: wfId,
      nodeId,
      activationId,
      finishedAt,
      inputsByPort: { in: [{ json: { invoiceId: 99 } }] },
      outputs: { main: [{ json: { invoiceId: 99, decision: { status: "cancelled" } } }] },
      hitlStatus: "hitl-cancelled",
    });

    expect(cancelledSnapshot.status).toBe("hitl-cancelled");

    await repo.save({
      ...state,
      status: "halted",
      reason: "hitl-cancelled",
      nodeSnapshotsByNodeId: { [nodeId]: cancelledSnapshot },
    } as PersistedRunState);

    const saved = await repo.load(runId);
    expect(saved?.status).toBe("halted");
    expect(saved?.reason).toBe("hitl-cancelled");
    const snap = saved?.nodeSnapshotsByNodeId?.[nodeId];
    expect(snap?.status).toBe("hitl-cancelled");
  });
});
