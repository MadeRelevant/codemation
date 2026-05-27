// @vitest-environment node

/**
 * Regression suite for the wiring gaps discovered when driving the HITL flow
 * end-to-end against the real Prisma-backed repository under tsx-dev.
 *
 * The unit / integration tests added by stories 01-12 all pass under
 * `InMemoryWorkflowRunRepository` and module-shared classes. They miss the
 * production runtime path:
 *
 *   - `PrismaWorkflowRunRepository` serialises one JSON column per typed field
 *     and silently drops anything the mapper doesn't know about.
 *   - The framework dev runtime resolves `@codemation/core` to its TypeScript
 *     source via the `development` exports condition while consumers see the
 *     prebuilt `dist`. Cross-package `instanceof` checks against types loaded
 *     from both sides fail.
 *   - Zod v4's `z.toJSONSchema()` emits draft 2020-12; the default Ajv build
 *     refuses to compile it.
 *
 * Each `it(...)` below names the production bug it guards against. When the
 * fifth (still-open) gap lands, flip its `.skip` to a real assertion.
 */

import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { PendingResumeEntry, PersistedRunState, PersistedSuspensionEntry } from "@codemation/core";
import { SuspensionRequest } from "@codemation/core";
import { Callback, createWorkflowBuilder, inboxApproval, ManualTrigger } from "@codemation/core-nodes";

import { PrismaWorkflowRunRepository } from "../../src/infrastructure/persistence/PrismaWorkflowRunRepository";
import type { WorkflowSnapshotRepository } from "../../src/infrastructure/persistence/PrismaWorkflowSnapshotRepository";
import { DecisionSchemaValidator } from "../../src/application/hitl/DecisionSchemaValidator";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";
import { IntegrationDatabaseFactory } from "../http/testkit/IntegrationDatabaseFactory";
import type { IntegrationDatabase } from "../http/testkit/IntegrationDatabaseFactory";
import { FrontendHttpIntegrationHarness } from "../http/testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "../http/testkit/IntegrationTestAuth";
import { mergeIntegrationDatabaseRuntime } from "../http/testkit/mergeIntegrationDatabaseRuntime";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";

const noopSnapshotRepo: WorkflowSnapshotRepository = {
  findOrCreate: async () => "snapshot-id-stub",
};

const FUTURE_ISO = "2099-01-01T00:00:00.000Z";

function makeRunState(runId: string): PersistedRunState {
  return {
    runId: runId as PersistedRunState["runId"],
    workflowId: "wf.hitl.wiring-test" as PersistedRunState["workflowId"],
    startedAt: "2026-05-26T00:00:00.000Z",
    revision: 0,
    status: "suspended",
    queue: [],
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
    mutableState: { nodesById: {} },
  };
}

function makeSuspensionEntry(taskId: string): PersistedSuspensionEntry {
  return {
    taskId,
    nodeId: "approve-invoice" as PersistedSuspensionEntry["nodeId"],
    activationId: "act_test_001" as PersistedSuspensionEntry["activationId"],
    itemIndex: 0,
    decisionSchemaHash: "abc12345",
    deliveryRef: { kind: "local", inboxItemId: taskId },
    timeoutAt: FUTURE_ISO,
    onTimeout: "halt",
  };
}

function makeResumeEntry(activationId: string): PendingResumeEntry {
  return {
    activationId: activationId as PendingResumeEntry["activationId"],
    nodeId: "approve-invoice" as PendingResumeEntry["nodeId"],
    resumeContext: {
      decision: {
        kind: "decided",
        value: { approved: true, note: "wiring-test" },
        actor: { actorId: "test-user" },
        decidedAt: new Date(FUTURE_ISO),
      },
      delivery: { kind: "local", inboxItemId: "htask_test" } as never,
      task: {
        taskId: "htask_test" as never,
        runId: "run_test_001" as never,
        nodeId: "approve-invoice" as never,
        expiresAt: new Date(FUTURE_ISO),
        resumeUrl: "stub",
      },
    },
  };
}

describe("HITL wiring gaps — Prisma round-trip + tsx-dev dual-class", () => {
  const session = new IntegrationTestDatabaseSession();

  beforeAll(async () => {
    await session.start();
  });

  afterEach(async () => {
    await session.afterEach();
  });

  afterAll(async () => {
    await session.dispose();
  });

  function requireTransactionClient(): unknown {
    const transaction = session.transaction;
    if (!transaction) {
      throw new Error("Integration database transaction is not ready.");
    }
    return transaction.getPrismaClient();
  }

  // -------------------------------------------------------------------------
  // GAP #1 — `SuspensionRequest` must extend `Error`.
  // -------------------------------------------------------------------------
  //
  // Production symptom: `InProcessRetryRunner.run` wraps any non-Error throwable
  // via `new Error(String(thrown))`. When `SuspensionRequest` was a plain class,
  // `String(req)` evaluated to `"[object Object]"` and the original payload
  // (including the `deliver` callback and `decisionSchema`) was lost. The
  // engine then logged the bare wrapped Error and marked the run `failed`
  // instead of suspending.
  it("SuspensionRequest instances are Error subclasses and stringify with a message", () => {
    const req = new SuspensionRequest({
      decisionSchema: z.object({ approved: z.boolean() }),
      timeout: "1h",
      onTimeout: "halt",
      subject: { title: "Approve test", summary: "stub" },
      deliver: async () => ({ kind: "local" as const, inboxItemId: "stub" }),
    });
    expect(req).toBeInstanceOf(Error);
    expect(req.name).toBe("SuspensionRequest");
    expect(String(req)).toContain("SuspensionRequest");
    expect(String(req)).not.toContain("[object Object]");
  });

  // -------------------------------------------------------------------------
  // GAP #2 — name-brand fallback when the SuspensionRequest class loads twice.
  // -------------------------------------------------------------------------
  //
  // Production symptom: in tsx dev with the `development` exports condition,
  // `@codemation/core` resolves to source for the dev runtime but to dist for
  // consumer packages (the next-host transpilePackages graph). The
  // `SuspensionRequest` class then exists as two distinct constructors. The
  // engine's catch site used a bare `instanceof SuspensionRequest`, which
  // failed across the boundary, and the throw bubbled up as a generic Error.
  //
  // The fix in `NodeExecutor` accepts either `instanceof SuspensionRequest`
  // OR `e instanceof Error && e.name === "SuspensionRequest" && typeof e.request === "object"`.
  // This test simulates the dual-class scenario with a custom Error subclass.
  it("name-brand check identifies a SuspensionRequest from a foreign class definition", () => {
    class ForeignSuspensionRequest extends Error {
      readonly request: object;
      constructor(request: object) {
        super("SuspensionRequest(foreign)");
        this.name = "SuspensionRequest";
        this.request = request;
      }
    }
    const e = new ForeignSuspensionRequest({ decisionSchema: { stub: true } });
    // The brand check the engine performs (see NodeExecutor try/catch).
    const isSuspension =
      e instanceof SuspensionRequest ||
      (e instanceof Error &&
        e.name === "SuspensionRequest" &&
        typeof (e as { request?: unknown }).request === "object");
    expect(isSuspension).toBe(true);
  });

  // -------------------------------------------------------------------------
  // GAP #3 — DecisionSchemaValidator must accept Zod v4 draft 2020-12 schemas.
  // -------------------------------------------------------------------------
  //
  // Production symptom: every POST /api/hitl/tasks/:id/decide 500'd with
  // `no schema with key or ref "https://json-schema.org/draft/2020-12/schema"`.
  // Zod v4's `z.toJSONSchema()` emits a draft 2020-12 schema that the default
  // Ajv build (draft-07) refuses to compile. The fix imports `ajv/dist/2020`.
  it("DecisionSchemaValidator validates a Zod v4-emitted draft 2020-12 schema", () => {
    const decisionSchema = z.object({
      approved: z.boolean(),
      note: z.string().optional(),
    });
    const schemaJson = JSON.stringify(z.toJSONSchema(decisionSchema));
    const validator = new DecisionSchemaValidator();

    const ok = validator.validate({ schemaJson, value: { approved: true, note: "ok" } });
    expect(ok).toEqual({ valid: true });

    const bad = validator.validate({ schemaJson, value: { approved: "yes" } });
    expect(bad.valid).toBe(false);
  });

  // -------------------------------------------------------------------------
  // GAP #4 — PrismaWorkflowRunRepository must round-trip state.suspension,
  //          state.pendingResume, and state.reason.
  // -------------------------------------------------------------------------
  //
  // Production symptom: stories 01/02/03 added these fields to
  // `PersistedRunState` but `PrismaWorkflowRunRepository.saveOnce` only
  // serialised `state.mutableState` to the `mutable_state_json` column. The
  // suspension array vanished on save, and `RunContinuationService.resumeRun`
  // then bailed with `No suspension entry with taskId "..." found on run ...`.
  //
  // The proper fix is the dedicated `hitl_state_json` column added in the
  // 20260527130000_add_hitl_state_json migration (superseding the interim
  // `_hitl*` stash in commit 63a6cfb3). This test verifies the new column path.
  it("PrismaWorkflowRunRepository round-trips suspension, pendingResume, and reason", async () => {
    const prismaClient = requireTransactionClient();
    const repo = new PrismaWorkflowRunRepository(prismaClient as never, noopSnapshotRepo);

    const runId = "run_wiring_test_001";
    const suspension = [makeSuspensionEntry("htask_round_trip_a"), makeSuspensionEntry("htask_round_trip_b")];
    const pendingResume = makeResumeEntry("act_resume_001");

    await repo.createRun({
      runId: runId as PersistedRunState["runId"],
      workflowId: "wf.hitl.wiring-test" as PersistedRunState["workflowId"],
      startedAt: "2026-05-26T00:00:00.000Z",
    });

    const state: PersistedRunState = {
      ...makeRunState(runId),
      suspension,
      pendingResume,
      reason: "hitl-rejected",
    };
    await repo.save(state);

    const loaded = await repo.load(runId);
    expect(loaded).toBeDefined();
    expect(loaded?.suspension).toBeDefined();
    expect(loaded?.suspension).toHaveLength(2);
    expect(loaded?.suspension?.map((s) => s.taskId)).toEqual(["htask_round_trip_a", "htask_round_trip_b"]);
    expect(loaded?.pendingResume).toBeDefined();
    expect(loaded?.pendingResume?.activationId).toBe("act_resume_001");
    expect(loaded?.pendingResume?.nodeId).toBe("approve-invoice");
    expect(loaded?.reason).toBe("hitl-rejected");
  });

  // -------------------------------------------------------------------------
  // Legacy-row hydration — rows written before the hitl_state_json migration
  //   (commit 63a6cfb3, _hitl* stash inside mutable_state_json) must still
  //   load correctly after the migration.
  // -------------------------------------------------------------------------
  it("PrismaWorkflowRunRepository loads HITL fields from legacy _hitl* stash in mutable_state_json", async () => {
    const prismaClient = requireTransactionClient() as {
      run: {
        create: (args: unknown) => Promise<unknown>;
        update: (args: unknown) => Promise<unknown>;
      };
    };
    const repo = new PrismaWorkflowRunRepository(prismaClient as never, noopSnapshotRepo);

    const runId = "run_legacy_hitl_test_001";
    const legacySuspension = [makeSuspensionEntry("htask_legacy_a")];
    const legacyPendingResume = makeResumeEntry("act_legacy_001");

    // Create the run via normal API (hitl_state_json will be null).
    await repo.createRun({
      runId: runId as PersistedRunState["runId"],
      workflowId: "wf.hitl.wiring-test" as PersistedRunState["workflowId"],
      startedAt: "2026-05-26T00:00:00.000Z",
    });

    // Directly write a legacy mutable_state_json blob with _hitl* keys, leaving
    // hitl_state_json as null to simulate a pre-migration row.
    await prismaClient.run.update({
      where: { runId },
      data: {
        mutableStateJson: JSON.stringify({
          nodesById: {},
          _hitlSuspension: legacySuspension,
          _hitlPendingResume: legacyPendingResume,
          _hitlReason: "hitl-rejected",
        }),
        hitlStateJson: null,
      },
    });

    const loaded = await repo.load(runId);
    expect(loaded).toBeDefined();
    // HITL fields must be hoisted from the legacy stash.
    expect(loaded?.suspension).toBeDefined();
    expect(loaded?.suspension).toHaveLength(1);
    expect(loaded?.suspension?.[0]?.taskId).toBe("htask_legacy_a");
    expect(loaded?.pendingResume?.activationId).toBe("act_legacy_001");
    expect(loaded?.reason).toBe("hitl-rejected");
    // _hitl* keys must NOT bleed into mutableState.
    expect(loaded?.mutableState).toBeDefined();
    const mutableKeys = Object.keys(loaded?.mutableState ?? {});
    expect(mutableKeys).not.toContain("_hitlSuspension");
    expect(mutableKeys).not.toContain("_hitlPendingResume");
    expect(mutableKeys).not.toContain("_hitlReason");
  });

  // GAP #5 tested in the describe block below.
});

// ---------------------------------------------------------------------------
// GAP #5 — ctx.resumeContext is threaded into the resumed activation.
// ---------------------------------------------------------------------------
//
// Production symptom: after POST /api/hitl/tasks/:id/decide returns 200 OK
// with runStatus=running, the engine re-activates the suspended node but
// `defineHumanApprovalNode.execute` sees `ctx.resumeContext === undefined`.
// It therefore throws a fresh `SuspensionRequest` instead of taking the
// "decided" branch, creating a second human_task row and leaving the run
// suspended again.
//
// Root cause: `RunContinuationService.resumeRun` builds the activation
// `request` using the plain `base` context (no `resumeContext`). On the
// inline scheduler path (`InlineDrivingScheduler`) the request is passed
// directly to `NodeExecutor.execute` without going through
// `NodeExecutionRequestHandlerService` (which is the only place that splices
// `resumeContext` from `state.pendingResume`). Fix: thread
// `{ ...base, resumeContext: args.resumeContext }` through the
// `createSingleFromDefinitionWithActivation` call.

describe("HITL wiring gap #5 — ctx.resumeContext reaches inboxApproval on resume", () => {
  const WORKFLOW_ID = "wf.hitl.gap5.resume";
  const APPROVAL_NODE_ID = "inbox-approval-gap5";
  const CALLBACK_NODE_ID = "callback-gap5";

  const workflow = createWorkflowBuilder({ id: WORKFLOW_ID, name: "HITL GAP#5 probe" })
    .trigger(new ManualTrigger("Start", "trigger-gap5"))
    .then(
      inboxApproval.create(
        {
          title: "GAP5 approval",
          body: "Please decide",
          priority: "normal",
          timeout: "1h",
          onTimeout: "halt",
        },
        "Inbox Approval",
        APPROVAL_NODE_ID,
      ),
    )
    .then(new Callback("Callback", (items) => items, CALLBACK_NODE_ID))
    .build();

  let database: IntegrationDatabase | null = null;
  let harness: FrontendHttpIntegrationHarness | null = null;

  beforeAll(async () => {
    database = await IntegrationDatabaseFactory.createEphemeral();
    harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(
        {
          workflows: [workflow],
          runtime: { eventBus: { kind: "memory" }, scheduler: { kind: "local" } },
          auth: IntegrationTestAuth.developmentBypass,
        },
        database,
      ),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: { AUTH_SECRET: "test-auth-secret-for-hitl-gap5-integration" },
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it("resumed inboxApproval activation receives ctx.resumeContext and routes to onDecision", async () => {
    const h = harness!;

    // 1. Start the run with one item so the inboxApproval has something to process.
    const createResult = await h.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: { workflowId: WORKFLOW_ID, items: [{ subject: "gap5-test-item" }] },
    });
    const runId = createResult.runId;

    // 2. Poll until the run suspends.
    const suspended = await pollUntilStatus(h, runId, "suspended", 5_000);
    expect(suspended.suspension).toBeDefined();
    expect(suspended.suspension).toHaveLength(1);

    const taskId = suspended.suspension![0]!.taskId;

    // 3. Decide: approve.
    const decideResult = await h.requestJson<{ status: string; runStatus: string }>({
      method: "POST",
      url: ApiPaths.hitlTaskDecide(taskId),
      payload: {
        decision: { approved: true, note: "gap5-test" },
        decidedBy: { actorId: "test-actor" },
      },
    });
    expect(decideResult.status).toBe("decided");
    expect(decideResult.runStatus).toBe("running");

    // 4. Poll until the run completes (Callback fires after resume).
    const completed = await pollUntilStatus(h, runId, "completed", 5_000);

    // 5. Assert the Callback received the decided item with decision.status = "approved".
    const callbackOutput = completed.outputsByNode[CALLBACK_NODE_ID]?.main;
    expect(callbackOutput).toBeDefined();
    expect(callbackOutput).toHaveLength(1);
    expect((callbackOutput![0]!.json as Record<string, unknown>)["decision"]).toMatchObject({
      status: "approved",
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pollUntilStatus(
  harness: FrontendHttpIntegrationHarness,
  runId: string,
  targetStatus: string,
  timeoutMs: number,
): Promise<PersistedRunState> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const response = await harness.request({ method: "GET", url: ApiPaths.runState(runId) });
    if (response.statusCode === 200) {
      const state = response.json<PersistedRunState>();
      if (state.status === targetStatus) return state;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  const last = await harness.request({ method: "GET", url: ApiPaths.runState(runId) });
  const state = last.statusCode === 200 ? last.json<PersistedRunState>() : null;
  throw new Error(
    `Run ${runId} did not reach status "${targetStatus}" within ${timeoutMs}ms. Last status: ${state?.status ?? "unknown"}`,
  );
}
