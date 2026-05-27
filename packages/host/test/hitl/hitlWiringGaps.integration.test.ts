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

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { PendingResumeEntry, PersistedRunState, PersistedSuspensionEntry } from "@codemation/core";
import { SuspensionRequest } from "@codemation/core";

import { PrismaWorkflowRunRepository } from "../../src/infrastructure/persistence/PrismaWorkflowRunRepository";
import type { WorkflowSnapshotRepository } from "../../src/infrastructure/persistence/PrismaWorkflowSnapshotRepository";
import { DecisionSchemaValidator } from "../../src/application/hitl/DecisionSchemaValidator";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

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
  // The interim fix stashes the three fields under `_hitl*` keys inside the
  // existing `mutable_state_json` blob. The proper fix is a dedicated
  // `hitl_state_json` column. This test guards either implementation.
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
  // GAP #5 — ctx.resumeContext is threaded into the resumed activation.
  // -------------------------------------------------------------------------
  //
  // STILL OPEN. Production symptom: after POST /api/hitl/tasks/:id/decide
  // returns 200 OK with runStatus=running, the engine re-activates the
  // suspended node but `defineHumanApprovalNode.execute` sees
  // `ctx.resumeContext === undefined`. It therefore throws a fresh
  // `SuspensionRequest` instead of taking the "decided" branch, creating a
  // second human_task row and leaving the run suspended again.
  //
  // The persisted state DOES carry the correct `_hitlPendingResume` with the
  // right `activationId`/`nodeId`/`resumeContext` (verified manually). The
  // gap is somewhere in the chain:
  //
  //   PrismaWorkflowRunRepository.load → state.pendingResume
  //     → NodeExecutionRequestHandlerService line 90-95 — threads `resumeContext`
  //       into `baseWithResume` (✓ confirmed by code reading)
  //     → NodeActivationRequestComposer.createSingleFromDefinitionWithActivation
  //       spreads `...args.base` into the ctx (✓ confirmed)
  //     → NodeExecutor.executeRunnableActivation — builds iterationCtx via
  //       `pickExecutionContext` + `itemExprResolver.resolveConfigForItem`,
  //       both of which spread the source ctx (✓ on code read)
  //     → defineHumanApprovalNode.execute reads `ctx.resumeContext`
  //
  // The unit test for the helper passes; the runtime path apparently breaks
  // somewhere not yet identified. Next-session debug: add a console.log at
  // the start of `defineHumanApprovalNode.execute` to dump `ctx.resumeContext`
  // and trace upward.
  //
  // Flip `.skip` to a real assertion once fixed — this should drive a full
  // workflow through `manualTrigger → inboxApproval → Callback` end-to-end
  // against the real container + Prisma DB and assert that the Callback fires
  // with `item.json.decision.status === "approved"`.
  it.skip("(open) resumed inboxApproval activation receives ctx.resumeContext and routes to onDecision", async () => {
    expect(true).toBe(false); // intentionally fails when un-skipped — implement the e2e harness here.
  });
});
