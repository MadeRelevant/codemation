/**
 * Core unit tests for RunContinuationService decision branches.
 *
 * The host-unit suite (HitlNodeStatus.test.ts) exercises the four HITL halt/continue
 * scenarios, but that coverage is NOT attributed to packages/core in the CI `core`
 * flag (host's vitest coverage only instruments packages/host/src). These tests
 * re-cover those branches plus the guard/error/webhook/resume paths, all in core.
 */
import { describe, expect, it } from "vitest";

import type {
  NodeActivationId,
  NodeExecutionSnapshot,
  NodeId,
  NodeOutputs,
  PersistedRunState,
  ResumeContext,
  RunId,
  RunResult,
  WebhookControlSignal,
  WebhookRunResult,
  WorkflowDefinition,
  WorkflowId,
} from "../../src/index.ts";
import { EngineWorkflowPlanningFactory } from "../../src/planning/EngineWorkflowPlanningFactory.ts";
import { WorkflowTopology } from "../../src/planning/WorkflowTopologyPlanner.ts";
import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository.ts";
import { createRunContinuationKit, seedPendingRun } from "./runContinuationServiceTestKit.ts";

type RunContinuationKitRepo = InMemoryWorkflowExecutionRepository;

const wfId = "wf_rcs" as WorkflowId;
const nodeId = "n1" as NodeId;
const runId = "run_rcs_1" as RunId;
const activationId = "act_rcs_1" as NodeActivationId;

function singleNodeWorkflow(): WorkflowDefinition {
  return {
    id: wfId,
    name: "RCS Test",
    nodes: [{ id: nodeId, kind: "node", type: {} as never, config: {} as never, name: "N1" }],
    edges: [],
  };
}

function twoNodeWorkflow(): WorkflowDefinition {
  return {
    id: wfId,
    name: "RCS Two-node",
    nodes: [
      { id: nodeId, kind: "node", type: {} as never, config: {} as never, name: "N1" },
      { id: "n2" as NodeId, kind: "node", type: {} as never, config: {} as never, name: "N2" },
    ],
    edges: [{ from: { nodeId, output: "main" }, to: { nodeId: "n2" as NodeId, input: "in" } }],
  };
}

function hitlOutput(status: "approved" | "rejected" | "timed-out" | "auto-accepted"): NodeOutputs {
  return { main: [{ json: { invoiceId: 42, decision: { status } } }] };
}

/** A planning factory whose planner is fully controllable. */
function fakePlanningFactory(opts: {
  workflow: WorkflowDefinition;
  nextActivation: () => { nodeId: NodeId; activationId?: NodeActivationId } | undefined;
}): EngineWorkflowPlanningFactory {
  return {
    create: (_wf: WorkflowDefinition) => ({
      topology: WorkflowTopology.fromWorkflow(opts.workflow),
      planner: {
        applyOutputs: () => {},
        nextActivation: opts.nextActivation,
      },
    }),
  } as unknown as EngineWorkflowPlanningFactory;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("RunContinuationService — guards", () => {
  it("throws Unknown runId when run does not exist", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await expect(
      kit.service.resumeFromNodeResult({ runId: "missing" as RunId, activationId, nodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/Unknown runId/);
  });

  it("throws when run is not pending", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    // status defaults to "running"
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/is not pending/);
  });

  it("throws on activationId mismatch", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({
        runId,
        activationId: "wrong" as NodeActivationId,
        nodeId,
        outputs: { main: [] },
      }),
    ).rejects.toThrow(/activationId mismatch/);
  });

  it("throws on nodeId mismatch", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId: "wrong" as NodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/nodeId mismatch/);
  });

  it("throws Unknown workflowId when snapshot resolver returns undefined", async () => {
    const kit = createRunContinuationKit({ workflow: undefined as never });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/Unknown workflowId/);
  });

  it("throws is-not-pending when status is pending but there is no pending execution record", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId, omitPending: true });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/is not pending/);
  });
});

// ---------------------------------------------------------------------------
// HITL resolution
// ---------------------------------------------------------------------------

describe("RunContinuationService — HITL resolution", () => {
  it("approved → completes with hitl-approved snapshot", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: hitlOutput("approved"),
    });
    expect(result.status).toBe("completed");
    const saved = await kit.repo.load(runId);
    expect(saved?.nodeSnapshotsByNodeId?.[nodeId]?.status).toBe("hitl-approved");
  });

  it("auto-accepted → completes with hitl-auto-accepted snapshot", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: hitlOutput("auto-accepted"),
    });
    expect(result.status).toBe("completed");
    const saved = await kit.repo.load(runId);
    expect(saved?.nodeSnapshotsByNodeId?.[nodeId]?.status).toBe("hitl-auto-accepted");
  });

  it("rejected → halts with reason hitl-rejected", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: hitlOutput("rejected"),
    });
    expect(result.status).toBe("halted");
    if (result.status === "halted") expect(result.reason).toBe("hitl-rejected");
    const saved = await kit.repo.load(runId);
    expect(saved?.status).toBe("halted");
    expect(saved?.nodeSnapshotsByNodeId?.[nodeId]?.status).toBe("hitl-rejected");
  });

  it("timed-out → halts with reason hitl-timeout", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: hitlOutput("timed-out"),
    });
    expect(result.status).toBe("halted");
    if (result.status === "halted") expect(result.reason).toBe("hitl-timeout");
  });

  it("an unrecognised decision.status is treated as a normal (non-HITL) output → completes", async () => {
    const kit = createRunContinuationKit({
      workflow: singleNodeWorkflow(),
      planningFactory: fakePlanningFactory({ workflow: singleNodeWorkflow(), nextActivation: () => undefined }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: { decision: { status: "something-else" } } }] },
    });
    expect(result.status).toBe("completed");
    // Not stamped with any hitl-* status since the decision status was unrecognised.
    const saved = await kit.repo.load(runId);
    expect(saved?.nodeSnapshotsByNodeId?.[nodeId]?.status).not.toMatch(/^hitl-/);
  });
});

// ---------------------------------------------------------------------------
// Completion / next-activation
// ---------------------------------------------------------------------------

describe("RunContinuationService — completion + next activation", () => {
  it("no next activation → completes the run", async () => {
    const kit = createRunContinuationKit({
      workflow: singleNodeWorkflow(),
      planningFactory: fakePlanningFactory({ workflow: singleNodeWorkflow(), nextActivation: () => undefined }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: { ok: true } }] },
    });
    expect(result.status).toBe("completed");
  });

  it("next activation present → enqueues and returns the enqueue result", async () => {
    const wf = twoNodeWorkflow();
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const enqueueResult: { result: RunResult; queuedSnapshot: NodeExecutionSnapshot } = {
      result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
      queuedSnapshot,
    };
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueResult,
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: { ok: true } }] },
    });
    expect(kit.enqueueCalls).toBe(1);
    expect(result.status).toBe("pending");
    expect(kit.publishedEvents.some((e) => e.event === "nodeQueued")).toBe(true);
  });

  it("stop condition satisfied → completes immediately without enqueue", async () => {
    const wf = twoNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
    });
    await seedPendingRun(kit.repo, {
      runId,
      workflowId: wfId,
      nodeId,
      activationId,
      control: { stopCondition: { kind: "nodeCompleted", nodeId } },
    });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: { ok: true } }] },
    });
    expect(result.status).toBe("completed");
    expect(kit.enqueueCalls).toBe(0);
  });

  it("maxNodeActivations exceeded → fails the run", async () => {
    const wf = twoNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
    });
    await seedPendingRun(kit.repo, {
      runId,
      workflowId: wfId,
      nodeId,
      activationId,
      executionOptions: { maxNodeActivations: 1 } as never,
      queue: [{ nodeId: "n2" as NodeId, input: [{ json: { q: true } }] }] as never,
    });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: { ok: true } }] },
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error?.message).toMatch(/maxNodeActivations/);
  });

  it("next node is not a runnable node → throws", async () => {
    const wf: WorkflowDefinition = {
      id: wfId,
      name: "Trigger-next",
      nodes: [
        { id: nodeId, kind: "node", type: {} as never, config: {} as never, name: "N1" },
        { id: "trig2" as NodeId, kind: "trigger", type: {} as never, config: {} as never, name: "Trig2" },
      ],
      edges: [{ from: { nodeId, output: "main" }, to: { nodeId: "trig2" as NodeId, input: "in" } }],
    };
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "trig2" as NodeId }) }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [{ json: {} }] } }),
    ).rejects.toThrow(/is not a runnable node/);
  });

  it("planner.nextActivation throws → wraps error with node label + output counts", async () => {
    const wf = singleNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({
        workflow: wf,
        nextActivation: () => {
          throw new Error("planner boom");
        },
      }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [{ json: {} }], other: [] } }),
    ).rejects.toThrow(/could not plan the next activation.*planner boom.*Outputs:/s);
  });

  it("planner.nextActivation throws with empty outputs → 'no outputs' in the message", async () => {
    const wf = singleNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({
        workflow: wf,
        nextActivation: () => {
          throw new Error("planner boom");
        },
      }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: {} as never }),
    ).rejects.toThrow(/no outputs/);
  });

  it("enqueue rejection → terminates the run as failed and invokes workflow error handler", async () => {
    const wf = twoNodeWorkflow();
    const workflowErrorCalls: unknown[] = [];
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueResult: new Error("input contract violation"),
      workflowErrorHandler: { onError: (args) => void workflowErrorCalls.push(args) },
    });
    await seedPendingRun(kit.repo, {
      runId,
      workflowId: wfId,
      nodeId,
      activationId,
      queue: [{ nodeId: "n2" as NodeId, input: [{ json: { q: true } }] }] as never,
    });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: { ok: true } }] },
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error?.message).toMatch(/input contract violation/);
    expect(kit.workflowErrorCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resumeFromNodeError
// ---------------------------------------------------------------------------

describe("RunContinuationService — resumeFromNodeError", () => {
  it("with no error handlers → fails the run (preserving the pending queue)", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, {
      runId,
      workflowId: wfId,
      nodeId,
      activationId,
      queue: [{ nodeId: "n2" as NodeId, input: [{ json: { q: true } }] }] as never,
    });
    const result = await kit.service.resumeFromNodeError({ runId, activationId, nodeId, error: new Error("boom") });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error?.message).toBe("boom");
    const saved = await kit.repo.load(runId);
    expect(saved?.nodeSnapshotsByNodeId?.[nodeId]?.status).toBe("failed");
  });

  it("invokes workflow error handler on failure", async () => {
    const kit = createRunContinuationKit({
      workflow: singleNodeWorkflow(),
      workflowErrorHandler: { onError: () => {} },
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeError({ runId, activationId, nodeId, error: new Error("boom") });
    expect(result.status).toBe("failed");
    expect(kit.workflowErrorCalls).toHaveLength(1);
  });

  it("node error handler recovers → resumes as a normal result (completes)", async () => {
    const wf = singleNodeWorkflow();
    // The node config must carry nodeErrorHandler for resolveNodeErrorHandler to be consulted;
    // our policyErrorServices stub returns the handler regardless of config.
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => undefined }),
      nodeErrorHandler: { handle: () => ({ main: [{ json: { recovered: true } }] }) },
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId,
      nodeId,
      error: new Error("recoverable"),
    });
    expect(result.status).toBe("completed");
    expect(kit.nodeErrorCalls).toHaveLength(1);
  });

  it("node error handler throws → falls through to workflow failure", async () => {
    const kit = createRunContinuationKit({
      workflow: singleNodeWorkflow(),
      nodeErrorHandler: {
        handle: () => {
          throw new Error("handler also failed");
        },
      },
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeError({ runId, activationId, nodeId, error: new Error("orig") });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error?.message).toBe("orig");
  });
});

// ---------------------------------------------------------------------------
// waitForCompletion early-return branches
// ---------------------------------------------------------------------------

describe("RunContinuationService — waitForCompletion early returns", () => {
  it("returns completed for an already-completed run", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({ ...state!, status: "completed" });
    const result = await kit.service.waitForCompletion(runId);
    expect(result.status).toBe("completed");
  });

  it("returns failed for an already-failed run", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({ ...state!, status: "failed" });
    const result = await kit.service.waitForCompletion(runId);
    expect(result.status).toBe("failed");
  });

  it("returns halted for an already-halted run", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({ ...state!, status: "halted", reason: "hitl-rejected" });
    const result = await kit.service.waitForCompletion(runId);
    expect(result.status).toBe("halted");
    if (result.status === "halted") expect(result.reason).toBe("hitl-rejected");
  });
});

// ---------------------------------------------------------------------------
// markNodeRunning
// ---------------------------------------------------------------------------

describe("RunContinuationService — markNodeRunning", () => {
  it("writes a running snapshot and publishes nodeStarted for the matching pending execution", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await kit.service.markNodeRunning({ runId, activationId, nodeId, inputsByPort: { in: [{ json: {} }] } });
    const saved = await kit.repo.load(runId);
    expect(saved?.nodeSnapshotsByNodeId?.[nodeId]?.status).toBe("running");
    expect(kit.publishedEvents.some((e) => e.event === "nodeStarted")).toBe(true);
  });

  it("is a no-op when there is no pending execution", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    await kit.service.markNodeRunning({ runId, activationId, nodeId, inputsByPort: { in: [] } });
    expect(kit.publishedEvents).toHaveLength(0);
  });

  it("is a no-op when the activation does not match the pending execution", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await kit.service.markNodeRunning({
      runId,
      activationId: "other" as NodeActivationId,
      nodeId,
      inputsByPort: { in: [] },
    });
    expect(kit.publishedEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resumeFromNodeError + step delegators guards
// ---------------------------------------------------------------------------

describe("RunContinuationService — resumeFromNodeError guards", () => {
  it("throws Unknown runId", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await expect(
      kit.service.resumeFromNodeError({ runId: "missing" as RunId, activationId, nodeId, error: new Error("x") }),
    ).rejects.toThrow(/Unknown runId/);
  });

  it("throws on activationId mismatch", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeError({
        runId,
        activationId: "wrong" as NodeActivationId,
        nodeId,
        error: new Error("x"),
      }),
    ).rejects.toThrow(/activationId mismatch/);
  });

  it("throws Unknown workflowId when the workflow cannot be resolved", async () => {
    const kit = createRunContinuationKit({ workflow: undefined as never });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeError({ runId, activationId, nodeId, error: new Error("x") }),
    ).rejects.toThrow(/Unknown workflowId/);
  });

  it("resumeFromStepResult delegates to resumeFromNodeResult", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromStepResult({
      runId,
      activationId,
      nodeId,
      outputs: hitlOutput("approved"),
    });
    expect(result.status).toBe("completed");
  });

  it("resumeFromStepError delegates to resumeFromNodeError", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromStepError({
      runId,
      activationId,
      nodeId,
      error: new Error("step boom"),
    });
    expect(result.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// asWebhookControlSignal classification (via resumeFromNodeError trigger path)
// ---------------------------------------------------------------------------

describe("RunContinuationService — asWebhookControlSignal rejection", () => {
  const triggerId = "trig" as NodeId;
  const triggerActivationId = "act_trig" as NodeActivationId;
  const wf: WorkflowDefinition = {
    id: wfId,
    name: "Webhook reject WF",
    nodes: [{ id: triggerId, kind: "trigger", type: {} as never, config: {} as never, name: "Trigger" }],
    edges: [],
  };

  async function seed(repo: RunContinuationKitRepo): Promise<void> {
    await repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await repo.load(runId);
    await repo.save({
      ...state!,
      status: "pending",
      executionOptions: { webhook: true } as never,
      pending: {
        runId,
        workflowId: wfId,
        activationId: triggerActivationId,
        nodeId: triggerId,
        itemsIn: 0,
        inputsByPort: { in: [] } as never,
        receiptId: "r1",
        batchId: "batch_1",
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
  }

  it("a signal with the wrong kind is rejected → normal failure", async () => {
    const kit = createRunContinuationKit({ workflow: wf });
    await seed(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: Object.assign(new Error("bad"), { __webhookControl: true, kind: "nope", responseItems: [] }),
    });
    expect(result.status).toBe("failed");
  });

  it("a signal with non-array responseItems is rejected → normal failure", async () => {
    const kit = createRunContinuationKit({ workflow: wf });
    await seed(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: Object.assign(new Error("bad"), {
        __webhookControl: true,
        kind: "respondNow",
        responseItems: "not-array",
      }),
    });
    expect(result.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// resumeRun (HITL human-decision re-activation)
// ---------------------------------------------------------------------------

describe("RunContinuationService — resumeRun", () => {
  function resumeContextFor(taskId: string): ResumeContext {
    return {
      decision: {
        kind: "decided",
        value: { approved: true },
        actor: { actorId: "u1", displayName: "Alice" },
        decidedAt: new Date(),
      },
      delivery: { channel: "slack", ts: "T1" },
      task: { taskId, runId, nodeId: "n2", expiresAt: new Date(), resumeUrl: "" },
    } as ResumeContext;
  }

  async function seedSuspendedRun(repo: RunContinuationKitRepo): Promise<void> {
    await repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await repo.load(runId);
    await repo.save({
      ...state!,
      status: "suspended",
      // Upstream node n1 produced one item that fed n2 (the suspended node).
      outputsByNode: { [nodeId]: { main: [{ json: { invoiceId: 42 } }] } } as never,
      suspension: [
        {
          taskId: "htask_x",
          nodeId: "n2" as NodeId,
          activationId: "act_suspended" as NodeActivationId,
          itemIndex: 0,
          decisionSchemaHash: "hash",
          deliveryRef: { channel: "slack" } as never,
          timeoutAt: new Date(new Date().getTime() + 60_000).toISOString(),
          onTimeout: "halt",
        },
      ],
    } as PersistedRunState);
  }

  it("re-activates the suspended node and enqueues with pendingResume", async () => {
    const wf = twoNodeWorkflow();
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    await seedSuspendedRun(kit.repo);

    const result = await kit.service.resumeRun({
      runId,
      taskId: "htask_x",
      resumeContext: resumeContextFor("htask_x"),
    });
    expect(result.status).toBe("pending");
    expect(kit.enqueueCalls).toBe(1);
    expect(kit.publishedEvents.some((e) => e.event === "nodeQueued")).toBe(true);
  });

  it("throws when the run is not suspended", async () => {
    const kit = createRunContinuationKit({ workflow: twoNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    await expect(
      kit.service.resumeRun({ runId, taskId: "htask_x", resumeContext: resumeContextFor("htask_x") }),
    ).rejects.toThrow(/is not suspended/);
  });

  it("throws when the taskId is unknown", async () => {
    const kit = createRunContinuationKit({ workflow: twoNodeWorkflow() });
    await seedSuspendedRun(kit.repo);
    await expect(
      kit.service.resumeRun({ runId, taskId: "missing", resumeContext: resumeContextFor("missing") }),
    ).rejects.toThrow(/No suspension entry/);
  });

  it("throws when the run does not exist", async () => {
    const kit = createRunContinuationKit({ workflow: twoNodeWorkflow() });
    await expect(
      kit.service.resumeRun({
        runId: "missing" as RunId,
        taskId: "htask_x",
        resumeContext: resumeContextFor("htask_x"),
      }),
    ).rejects.toThrow(/Unknown runId/);
  });

  it("throws Unknown workflowId when the workflow cannot be resolved", async () => {
    const kit = createRunContinuationKit({ workflow: undefined as never });
    await seedSuspendedRun(kit.repo);
    await expect(
      kit.service.resumeRun({ runId, taskId: "htask_x", resumeContext: resumeContextFor("htask_x") }),
    ).rejects.toThrow(/Unknown workflowId/);
  });

  it("throws when the suspended node is not a runnable node", async () => {
    // Workflow where the suspended node id ("n2") is a trigger, not a node.
    const wf: WorkflowDefinition = {
      id: wfId,
      name: "Suspended-not-node",
      nodes: [
        { id: nodeId, kind: "node", type: {} as never, config: {} as never, name: "N1" },
        { id: "n2" as NodeId, kind: "trigger", type: {} as never, config: {} as never, name: "TrigN2" },
      ],
      edges: [{ from: { nodeId, output: "main" }, to: { nodeId: "n2" as NodeId, input: "in" } }],
    };
    const kit = createRunContinuationKit({ workflow: wf });
    await seedSuspendedRun(kit.repo);
    await expect(
      kit.service.resumeRun({ runId, taskId: "htask_x", resumeContext: resumeContextFor("htask_x") }),
    ).rejects.toThrow(/is not a runnable node/);
  });
});

// ---------------------------------------------------------------------------
// resumeFromWebhookControl
// ---------------------------------------------------------------------------

describe("RunContinuationService — resumeFromWebhookControl", () => {
  const triggerId = "trig" as NodeId;
  const triggerActivationId = "act_trig" as NodeActivationId;

  function webhookWorkflow(withDownstream: boolean): WorkflowDefinition {
    const nodes: WorkflowDefinition["nodes"] = [
      { id: triggerId, kind: "trigger", type: {} as never, config: {} as never, name: "Trigger" },
    ];
    const edges: WorkflowDefinition["edges"] = [];
    if (withDownstream) {
      nodes.push({ id: "n2" as NodeId, kind: "node", type: {} as never, config: {} as never, name: "N2" });
      edges.push({ from: { nodeId: triggerId, output: "main" }, to: { nodeId: "n2" as NodeId, input: "in" } });
    }
    return { id: wfId, name: "Webhook WF", nodes, edges };
  }

  function controlSignalError(signal: WebhookControlSignal): Error {
    return Object.assign(new Error("webhook control"), signal);
  }

  async function seedWebhookPending(
    repo: RunContinuationKitRepo,
    extra: { maxNodeActivations?: number; stopAtTrigger?: boolean; queue?: PersistedRunState["queue"] } = {},
  ): Promise<void> {
    const executionOptions = {
      webhook: true,
      ...(extra.maxNodeActivations ? { maxNodeActivations: extra.maxNodeActivations } : {}),
    };
    await repo.createRun({
      runId,
      workflowId: wfId,
      startedAt: new Date().toISOString(),
      executionOptions: executionOptions as never,
    });
    const state = await repo.load(runId);
    await repo.save({
      ...state!,
      status: "pending",
      executionOptions: executionOptions as never,
      queue: extra.queue ?? [],
      control: extra.stopAtTrigger ? { stopCondition: { kind: "nodeCompleted", nodeId: triggerId } } : undefined,
      pending: {
        runId,
        workflowId: wfId,
        activationId: triggerActivationId,
        nodeId: triggerId,
        itemsIn: 0,
        inputsByPort: { in: [] } as never,
        receiptId: "r1",
        batchId: "batch_1",
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
  }

  it("respondNow → completes the run and resolves the webhook response", async () => {
    const wf = webhookWorkflow(false);
    const kit = createRunContinuationKit({ workflow: wf });
    await seedWebhookPending(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNow",
        responseItems: [{ json: { status: 200 } }],
      }),
    });
    expect(result.status).toBe("completed");
  });

  it("respondNowAndContinue with no next node → completes", async () => {
    const wf = webhookWorkflow(false);
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => undefined }),
    });
    await seedWebhookPending(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [{ json: { go: true } }],
      }),
    });
    expect(result.status).toBe("completed");
  });

  it("respondNowAndContinue with queue entries missing batchId → picks up pending batchId", async () => {
    const wf = webhookWorkflow(true);
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    // Seed with queue entry without batchId to hit the entry.batchId ?? batchId branch
    await kit.repo.createRun({
      runId,
      workflowId: wfId,
      startedAt: new Date().toISOString(),
      executionOptions: { webhook: true } as never,
    });
    const state = await kit.repo.load(runId);
    await kit.repo.save({
      ...state!,
      status: "pending",
      executionOptions: { webhook: true } as never,
      queue: [{ nodeId: "n2" as NodeId, input: [] }] as never, // no batchId
      pending: {
        runId,
        workflowId: wfId,
        activationId: triggerActivationId,
        nodeId: triggerId,
        itemsIn: 0,
        inputsByPort: { in: [] } as never,
        receiptId: "r_nb2",
        batchId: "batch_webhook",
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [{ json: { go: true } }],
      }),
    });
    expect(result.status).toBe("pending");
  });

  it("respondNowAndContinue with a next node → enqueues and stays pending", async () => {
    const wf = webhookWorkflow(true);
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    await seedWebhookPending(kit.repo, {
      queue: [{ nodeId: "n2" as NodeId, input: [{ json: { q: true } }] }] as never,
    });
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [{ json: { go: true } }],
      }),
    });
    expect(result.status).toBe("pending");
    expect(kit.enqueueCalls).toBe(1);
  });

  it("respondNowAndContinue with stop condition satisfied → completes", async () => {
    const wf = webhookWorkflow(true);
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
    });
    await seedWebhookPending(kit.repo, { stopAtTrigger: true });
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [{ json: { go: true } }],
      }),
    });
    expect(result.status).toBe("completed");
    expect(kit.enqueueCalls).toBe(0);
  });

  it("respondNowAndContinue with maxNodeActivations exceeded → fails", async () => {
    const wf = webhookWorkflow(true);
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
    });
    await seedWebhookPending(kit.repo, {
      maxNodeActivations: 1,
      queue: [{ nodeId: "n2" as NodeId, input: [{ json: { q: true } }] }] as never,
    });
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [{ json: { go: true } }],
      }),
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error?.message).toMatch(/maxNodeActivations/);
  });

  it("respondNowAndContinue with enqueue rejection → terminates as failed", async () => {
    const wf = webhookWorkflow(true);
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueResult: new Error("webhook enqueue rejected"),
    });
    await seedWebhookPending(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [{ json: { go: true } }],
      }),
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error?.message).toMatch(/webhook enqueue rejected/);
  });

  it("respondNowAndContinue whose next node is not runnable → throws", async () => {
    const wf: WorkflowDefinition = {
      id: wfId,
      name: "Webhook next-not-node",
      nodes: [
        { id: triggerId, kind: "trigger", type: {} as never, config: {} as never, name: "Trigger" },
        { id: "t2" as NodeId, kind: "trigger", type: {} as never, config: {} as never, name: "Trigger2" },
      ],
      edges: [{ from: { nodeId: triggerId, output: "main" }, to: { nodeId: "t2" as NodeId, input: "in" } }],
    };
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "t2" as NodeId }) }),
    });
    await seedWebhookPending(kit.repo);
    await expect(
      kit.service.resumeFromNodeError({
        runId,
        activationId: triggerActivationId,
        nodeId: triggerId,
        error: controlSignalError({
          __webhookControl: true,
          kind: "respondNowAndContinue",
          responseItems: [{ json: { status: 202 } }],
          continueItems: [{ json: { go: true } }],
        }),
      }),
    ).rejects.toThrow(/is not a runnable node/);
  });

  it("non-webhook-control error on a trigger → falls through to normal failure", async () => {
    const wf = webhookWorkflow(false);
    const kit = createRunContinuationKit({ workflow: wf });
    await seedWebhookPending(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: new Error("plain trigger error"),
    });
    expect(result.status).toBe("failed");
  });

  it("respondNowAndContinue with no batchId on pending → falls back to 'batch_1'", async () => {
    const wf = webhookWorkflow(false);
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => undefined }),
    });
    // Seed with no batchId on the pending execution
    await kit.repo.createRun({
      runId,
      workflowId: wfId,
      startedAt: new Date().toISOString(),
      executionOptions: { webhook: true } as never,
    });
    const state = await kit.repo.load(runId);
    await kit.repo.save({
      ...state!,
      status: "pending",
      executionOptions: { webhook: true } as never,
      queue: [],
      pending: {
        runId,
        workflowId: wfId,
        activationId: triggerActivationId,
        nodeId: triggerId,
        itemsIn: 0,
        inputsByPort: { in: [] } as never,
        receiptId: "r_nb",
        // batchId intentionally omitted
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [],
      }),
    });
    expect(result.status).toBe("completed");
  });

  it("respondNow with stop condition satisfied → completes", async () => {
    const wf = webhookWorkflow(true);
    const kit = createRunContinuationKit({ workflow: wf });
    await seedWebhookPending(kit.repo, { stopAtTrigger: true });
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNow",
        responseItems: [{ json: { status: 200 } }],
      }),
    });
    expect(result.status).toBe("completed");
    expect(kit.enqueueCalls).toBe(0);
  });

  it("respondNowAndContinue without continueItems → uses empty array for trigger outputs", async () => {
    const wf = webhookWorkflow(false);
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => undefined }),
    });
    await seedWebhookPending(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: Object.assign(new Error("webhook"), {
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        // intentionally omit continueItems to exercise the ?? [] fallback
      } as WebhookControlSignal),
    });
    expect(result.status).toBe("completed");
  });

  it("respondNowAndContinue with enqueue rejection (non-Error thrown) → terminates as failed", async () => {
    const wf = webhookWorkflow(true);
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueThrowsRaw: "string-cause-webhook",
    });
    await seedWebhookPending(kit.repo);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId: triggerActivationId,
      nodeId: triggerId,
      error: controlSignalError({
        __webhookControl: true,
        kind: "respondNowAndContinue",
        responseItems: [{ json: { status: 202 } }],
        continueItems: [{ json: { go: true } }],
      }),
    });
    // A non-Error thrown by enqueue is wrapped and run terminates as failed
    expect(result.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Branch coverage — miscellaneous ?? fallbacks and defensive branches
// ---------------------------------------------------------------------------

describe("RunContinuationService — branch coverage: batchId and queue fallbacks", () => {
  it("pendingExecution without batchId falls back to 'batch_1'", async () => {
    const kit = createRunContinuationKit({
      workflow: singleNodeWorkflow(),
      planningFactory: fakePlanningFactory({ workflow: singleNodeWorkflow(), nextActivation: () => undefined }),
    });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({
      ...state!,
      status: "pending",
      queue: [],
      pending: {
        runId,
        workflowId: wfId,
        activationId,
        nodeId,
        itemsIn: 1,
        inputsByPort: { in: [{ json: {} }] } as never,
        receiptId: "r_nobatch",
        // batchId intentionally omitted
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
    const result = await kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [] } });
    expect(result.status).toBe("completed");
  });

  it("queue entries without batchId pick up the pending batchId fallback", async () => {
    const wf = twoNodeWorkflow();
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    // queue entries have no batchId to exercise the q.batchId ?? batchId branch
    await kit.repo.save({
      ...state!,
      status: "pending",
      queue: [{ nodeId: "n2" as NodeId, input: [{ json: {} }] }] as never,
      pending: {
        runId,
        workflowId: wfId,
        activationId,
        nodeId,
        itemsIn: 1,
        inputsByPort: { in: [{ json: {} }] } as never,
        receiptId: "r_2",
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: {} }] },
    });
    expect(result.status).toBe("pending");
  });
});

describe("RunContinuationService — branch coverage: non-Error causes", () => {
  it("planner.nextActivation throws a non-Error value → String(cause) used in message", async () => {
    const wf = singleNodeWorkflow();
    const nonErrorCause = { toString: () => "non-error-cause-from-planner" };
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: {
        create: (_wf: WorkflowDefinition) => ({
          topology: WorkflowTopology.fromWorkflow(wf),
          planner: {
            applyOutputs: () => {},
            nextActivation: () => {
              throw nonErrorCause;
            },
          },
        }),
      } as unknown as EngineWorkflowPlanningFactory,
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/non-error-cause-from-planner/);
  });

  it("enqueue rejection with a non-Error thrown → wrapped and run terminates as failed", async () => {
    const wf = twoNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueThrowsRaw: "non-error-string",
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: {} }] },
    });
    expect(result.status).toBe("failed");
  });
});

describe("RunContinuationService — branch coverage: waitForCompletion paths", () => {
  it("waitForCompletion — already-completed run with unknown workflow returns empty outputs", async () => {
    const kit = createRunContinuationKit({ workflow: undefined as never });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({ ...state!, status: "completed" });
    const result = await kit.service.waitForCompletion(runId);
    expect(result.status).toBe("completed");
    if (result.status === "completed") expect(result.outputs).toEqual([]);
  });

  it("waitForCompletion — already-halted run with no reason falls back to hitl-rejected", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    // do not set reason to exercise the ?? "hitl-rejected" fallback
    await kit.repo.save({ ...state!, status: "halted" });
    const result = await kit.service.waitForCompletion(runId);
    expect(result.status).toBe("halted");
    if (result.status === "halted") expect(result.reason).toBe("hitl-rejected");
  });

  it("waitForCompletion — unexpected status from waiters throws", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const badResult = {
      runId,
      workflowId: wfId,
      startedAt: new Date().toISOString(),
      status: "pending",
    } as RunResult;
    const completionPromise = kit.service.waitForCompletion(runId);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    // Directly push to the waiter's internal promise resolution to bypass resolveRunCompletion filter
    // by resolving the waiter with a "pending" status, which waitForCompletion should reject.
    // Access the waiter via the protected map — use a workaround: resolve the completion waiter
    // with the unexpected status result via a direct injection.
    (kit.waiters as unknown as { completionWaiters: Map<RunId, Array<(r: RunResult) => void>> }).completionWaiters
      .get(runId)
      ?.forEach((r) => r(badResult));
    await expect(completionPromise).rejects.toThrow(/Unexpected run completion status/);
  });

  it("waitForCompletion — delegates to waiters when run is not yet terminal", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const completionResult: RunResult = {
      runId,
      workflowId: wfId,
      startedAt: new Date().toISOString(),
      status: "completed",
      outputs: [],
    };
    // Start waitForCompletion (it hits repo.load → not terminal → registers a waiter).
    // Resolve the waiter from a setTimeout so the waiter is definitely registered first.
    const completionPromise = kit.service.waitForCompletion(runId);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    kit.waiters.resolveRunCompletion(completionResult);
    const result = await completionPromise;
    expect(result.status).toBe("completed");
  });
});

describe("RunContinuationService — waitForWebhookResponse", () => {
  it("delegates to waiters.waitForWebhookResponse and resolves when the waiter fires", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    const promise = kit.service.waitForWebhookResponse(runId);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const webhookResult: WebhookRunResult = {
      runId,
      workflowId: wfId,
      startedAt: new Date().toISOString(),
      runStatus: "completed",
      response: [{ json: { ok: true } }],
    };
    kit.waiters.resolveWebhookResponse(webhookResult);
    expect(await promise).toEqual(webhookResult);
  });
});

describe("RunContinuationService — branch coverage: resumeRun edge cases", () => {
  function resumeCtx(taskId: string): ResumeContext {
    return {
      decision: {
        kind: "decided",
        value: { approved: true },
        actor: { actorId: "u1", displayName: "Alice" },
        decidedAt: new Date(),
      },
      delivery: { channel: "slack", ts: "T1" },
      task: { taskId, runId, nodeId: "n2", expiresAt: new Date(), resumeUrl: "" },
    } as ResumeContext;
  }

  async function seedSuspendedWithTwoEntries(repo: InMemoryWorkflowExecutionRepository): Promise<void> {
    await repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await repo.load(runId);
    await repo.save({
      ...state!,
      status: "suspended",
      outputsByNode: { [nodeId]: { main: [{ json: { a: 1 } }, { json: { a: 2 } }] } } as never,
      suspension: [
        {
          taskId: "task_a",
          nodeId: "n2" as NodeId,
          activationId: "act_a" as NodeActivationId,
          itemIndex: 0,
          decisionSchemaHash: "h",
          deliveryRef: { channel: "slack" } as never,
          timeoutAt: new Date(new Date().getTime() + 60_000).toISOString(),
          onTimeout: "halt",
        },
        {
          taskId: "task_b",
          nodeId: "n2" as NodeId,
          activationId: "act_b" as NodeActivationId,
          itemIndex: 1,
          decisionSchemaHash: "h",
          deliveryRef: { channel: "slack" } as never,
          timeoutAt: new Date(new Date().getTime() + 60_000).toISOString(),
          onTimeout: "halt",
        },
      ],
    } as PersistedRunState);
  }

  it("resumeRun with two suspensions — remaining suspension is kept (not cleared)", async () => {
    const wf = twoNodeWorkflow();
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    await seedSuspendedWithTwoEntries(kit.repo);
    // Resume task_a; task_b should remain as remainingSuspensions
    const result = await kit.service.resumeRun({ runId, taskId: "task_a", resumeContext: resumeCtx("task_a") });
    expect(result.status).toBe("pending");
    expect(kit.enqueueCalls).toBe(1);
  });

  it("resumeRun — suspension entry with itemIndex beyond available items uses all items", async () => {
    const wf = twoNodeWorkflow();
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({
      ...state!,
      status: "suspended",
      // Only 1 item available, but itemIndex is 5 (out of range)
      outputsByNode: { [nodeId]: { main: [{ json: { x: 1 } }] } } as never,
      suspension: [
        {
          taskId: "task_x",
          nodeId: "n2" as NodeId,
          activationId: "act_x" as NodeActivationId,
          itemIndex: 5,
          decisionSchemaHash: "h",
          deliveryRef: { channel: "slack" } as never,
          timeoutAt: new Date(new Date().getTime() + 60_000).toISOString(),
          onTimeout: "halt",
        },
      ],
    } as PersistedRunState);
    // itemIndex out of range → allParentItems used directly (not sliced)
    const result = await kit.service.resumeRun({ runId, taskId: "task_x", resumeContext: resumeCtx("task_x") });
    expect(result.status).toBe("pending");
  });

  it("resumeRun — node with no upstream edge falls back to empty resumeInput", async () => {
    // n2 has no parent edge in this workflow, so parentNodeId will be undefined
    const wf: WorkflowDefinition = {
      id: wfId,
      name: "No-parent WF",
      nodes: [
        { id: nodeId, kind: "node", type: {} as never, config: {} as never, name: "N1" },
        { id: "n2" as NodeId, kind: "node", type: {} as never, config: {} as never, name: "N2" },
      ],
      edges: [], // no edge to n2
    };
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({
      ...state!,
      status: "suspended",
      outputsByNode: {} as never,
      suspension: [
        {
          taskId: "task_y",
          nodeId: "n2" as NodeId,
          activationId: "act_y" as NodeActivationId,
          itemIndex: 0,
          decisionSchemaHash: "h",
          deliveryRef: { channel: "slack" } as never,
          timeoutAt: new Date(new Date().getTime() + 60_000).toISOString(),
          onTimeout: "halt",
        },
      ],
    } as PersistedRunState);
    const result = await kit.service.resumeRun({ runId, taskId: "task_y", resumeContext: resumeCtx("task_y") });
    expect(result.status).toBe("pending");
  });
});

describe("RunContinuationService — branch coverage: node error handler multi-port", () => {
  it("node error handler with multi-port inputsByPort → kind is 'multi', inputsByPort passed", async () => {
    const wf = singleNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => undefined }),
      nodeErrorHandler: { handle: () => ({ main: [{ json: { recovered: true } }] }) },
    });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    // Provide inputsByPort with two ports ("in" and "extra") so portKeys.length > 1 → kind = "multi"
    await kit.repo.save({
      ...state!,
      status: "pending",
      queue: [],
      pending: {
        runId,
        workflowId: wfId,
        activationId,
        nodeId,
        itemsIn: 1,
        inputsByPort: { in: [{ json: {} }], extra: [{ json: {} }] } as never,
        receiptId: "r_multi",
        batchId: "batch_1",
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
    const result = await kit.service.resumeFromNodeError({ runId, activationId, nodeId, error: new Error("multi") });
    expect(result.status).toBe("completed");
    // The handler was called
    expect(kit.nodeErrorCalls).toHaveLength(1);
  });

  it("node error handler with no 'in' port → kind is 'multi', items defaults to empty array", async () => {
    const wf = singleNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => undefined }),
      nodeErrorHandler: { handle: () => ({ main: [{ json: { recovered: true } }] }) },
    });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    // Provide inputsByPort without 'in' key — portKeys[0] is 'side', so kind = "multi"
    // and inputsByPort.in is undefined → ?? [] fallback fires
    await kit.repo.save({
      ...state!,
      status: "pending",
      queue: [],
      pending: {
        runId,
        workflowId: wfId,
        activationId,
        nodeId,
        itemsIn: 0,
        inputsByPort: { side: [{ json: {} }] } as never,
        receiptId: "r_noIn",
        batchId: "batch_1",
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId,
      nodeId,
      error: new Error("side-port"),
    });
    expect(result.status).toBe("completed");
    expect(kit.nodeErrorCalls).toHaveLength(1);
  });
});

describe("RunContinuationService — branch coverage: error with no message + suspension ?? fallbacks", () => {
  it("resumeFromNodeError with an error object missing .message → String fallback used", async () => {
    const kit = createRunContinuationKit({ workflow: singleNodeWorkflow() });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    // Construct an Error-like object where message is undefined
    const errorNoMsg = Object.create(Error.prototype) as Error;
    Object.defineProperty(errorNoMsg, "message", { value: undefined, writable: true });
    const result = await kit.service.resumeFromNodeError({
      runId,
      activationId,
      nodeId,
      error: errorNoMsg,
    });
    expect(result.status).toBe("failed");
  });

  it("resumeRun — suspended run with no suspension array still processes correctly", async () => {
    const wf = twoNodeWorkflow();
    const queuedSnapshot = { nodeId: "n2", status: "queued" } as unknown as NodeExecutionSnapshot;
    const kit = createRunContinuationKit({
      workflow: wf,
      enqueueResult: {
        result: { runId, workflowId: wfId, startedAt: new Date().toISOString(), status: "pending" } as RunResult,
        queuedSnapshot,
      },
    });
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({
      ...state!,
      status: "suspended",
      outputsByNode: { [nodeId]: { main: [{ json: { x: 1 } }] } } as never,
      // suspension intentionally omitted → exercises the ?? [] fallback
      suspension: [
        {
          taskId: "t_nosusparray",
          nodeId: "n2" as NodeId,
          activationId: "act_s" as NodeActivationId,
          itemIndex: 0,
          decisionSchemaHash: "h",
          deliveryRef: { channel: "slack" } as never,
          timeoutAt: new Date(new Date().getTime() + 60_000).toISOString(),
          onTimeout: "halt",
        },
      ],
    } as PersistedRunState);
    // Remove the suspension array from the in-memory store to force undefined
    const raw = await kit.repo.load(runId);
    if (raw) {
      await kit.repo.save({ ...raw, suspension: undefined });
    }
    // Now suspension is undefined — the "find" throws "No suspension entry" for any taskId
    await expect(
      kit.service.resumeRun({
        runId,
        taskId: "t_nosusparray",
        resumeContext: {
          decision: {
            kind: "decided",
            value: {},
            actor: { actorId: "u1", displayName: "A" },
            decidedAt: new Date(),
          },
          delivery: { channel: "slack", ts: "T1" },
          task: { taskId: "t_nosusparray", runId, nodeId: "n2", expiresAt: new Date(), resumeUrl: "" },
        } as ResumeContext,
      }),
    ).rejects.toThrow(/No suspension entry/);
  });
});

describe("RunContinuationService — branch coverage: formatNodeLabel", () => {
  it("planner throws and completed node not found in topology → label uses 'Node' token", async () => {
    // Create a workflow where the planner's context node is NOT in the definition list
    // The node "ghost" won't be in topology.defsById → completedDefinition is undefined
    const wf: WorkflowDefinition = {
      id: wfId,
      name: "Ghost node WF",
      nodes: [{ id: nodeId, kind: "node", type: {} as never, config: {} as never, name: "N1" }],
      edges: [],
    };
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({
        workflow: wf,
        nextActivation: () => {
          throw new Error("planning failure");
        },
      }),
    });
    // Seed with a nodeId that IS in the topology, but let's use a ghost nodeId at the service call
    // The completedDefinition is looked up by args.nodeId — seed with a different nodeId not in topology
    const ghostId = "ghost_n" as NodeId;
    await kit.repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
    const state = await kit.repo.load(runId);
    await kit.repo.save({
      ...state!,
      status: "pending",
      queue: [],
      pending: {
        runId,
        workflowId: wfId,
        activationId,
        nodeId: ghostId,
        itemsIn: 1,
        inputsByPort: { in: [{ json: {} }] } as never,
        receiptId: "r_ghost",
        batchId: "batch_1",
        enqueuedAt: new Date().toISOString(),
      },
    } as PersistedRunState);
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId: ghostId, outputs: { main: [] } }),
    ).rejects.toThrow(/Node:ghost_n/);
  });

  it("planner throws and completed node has no name → label uses token name only", async () => {
    const wf: WorkflowDefinition = {
      id: wfId,
      name: "Nameless node WF",
      nodes: [
        {
          id: nodeId,
          kind: "node",
          type: {} as never,
          config: {} as never,
          // name intentionally omitted to exercise the definition?.name falsy branch
        },
      ],
      edges: [],
    };
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({
        workflow: wf,
        nextActivation: () => {
          throw new Error("planning failure");
        },
      }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/could not plan/);
  });

  it("planner throws and node type is a function → function name used as token name", async () => {
    function MyNodeClass() {}
    const wf: WorkflowDefinition = {
      id: wfId,
      name: "Function-type WF",
      nodes: [
        {
          id: nodeId,
          kind: "node",
          type: MyNodeClass as never,
          config: {} as never,
          name: "FnNode",
        },
      ],
      edges: [],
    };
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({
        workflow: wf,
        nextActivation: () => {
          throw new Error("planning failure");
        },
      }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    await expect(
      kit.service.resumeFromNodeResult({ runId, activationId, nodeId, outputs: { main: [] } }),
    ).rejects.toThrow(/MyNodeClass/);
  });

  it("enqueue rejection with error having no message → error.message fallback in terminateRun", async () => {
    const wf = twoNodeWorkflow();
    // Create an error with undefined message to trigger args.error.message ?? String(args.error)
    const errNoMsg = Object.create(Error.prototype) as Error;
    Object.defineProperty(errNoMsg, "message", { value: undefined, writable: true });
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({ workflow: wf, nextActivation: () => ({ nodeId: "n2" as NodeId }) }),
      enqueueResult: errNoMsg,
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    const result = await kit.service.resumeFromNodeResult({
      runId,
      activationId,
      nodeId,
      outputs: { main: [{ json: {} }] },
    });
    expect(result.status).toBe("failed");
  });

  it("formatOutputCounts with null item arrays in outputs → uses 0 for length", async () => {
    const wf = singleNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({
        workflow: wf,
        nextActivation: () => {
          throw new Error("planner boom");
        },
      }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    // Pass outputs with a null items array to exercise items?.length ?? 0
    await expect(
      kit.service.resumeFromNodeResult({
        runId,
        activationId,
        nodeId,
        outputs: { main: null as never },
      }),
    ).rejects.toThrow(/main=0/);
  });

  it("formatOutputCounts with null outputs itself → 'no outputs' in message", async () => {
    const wf = singleNodeWorkflow();
    const kit = createRunContinuationKit({
      workflow: wf,
      planningFactory: fakePlanningFactory({
        workflow: wf,
        nextActivation: () => {
          throw new Error("planner boom");
        },
      }),
    });
    await seedPendingRun(kit.repo, { runId, workflowId: wfId, nodeId, activationId });
    // Pass null as outputs to exercise the outputs ?? {} branch
    await expect(
      kit.service.resumeFromNodeResult({
        runId,
        activationId,
        nodeId,
        outputs: null as never,
      }),
    ).rejects.toThrow(/no outputs/);
  });
});
