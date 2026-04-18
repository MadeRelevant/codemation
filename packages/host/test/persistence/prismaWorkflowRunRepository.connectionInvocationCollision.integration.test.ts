// @vitest-environment node

import type { ConnectionInvocationRecord, PersistedRunState } from "@codemation/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaWorkflowRunRepository } from "../../src/infrastructure/persistence/PrismaWorkflowRunRepository";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

/**
 * Regression guard for the production failure:
 *
 *   PrismaClientKnownRequestError:
 *   Unique constraint failed on the fields: (`instance_id`)
 *   at PrismaWorkflowRunRepository$1.saveOnce
 *   at EventPublishingWorkflowExecutionRepository.save
 *
 * User-facing trigger: "Manual trigger -> AI agent -> node -> node". Clicking
 * play on the agent creates connection invocations under run R1. Clicking play
 * on the next node starts a new run R2. Before the fix, the engine carried the
 * prior `connectionInvocations` array from the current-state / debugger overlay
 * verbatim into R2's save payload (see `RunStartService.createRunCurrentState`).
 * Those records kept their original `invocationId`, which maps to the
 * `instance_id` primary key in the `ExecutionInstance` table. The subsequent
 * `tx.executionInstance.create(...)` call collided with the row owned by R1.
 *
 * Post-fix invariants (Option A):
 *   1. A connection invocation belongs to exactly one run. Reruns start with an
 *      empty invocation ledger.
 *   2. `PrismaWorkflowRunRepository` refuses to insert invocations whose
 *      `runId` differs from the run being saved (defense-in-depth), so a stale
 *      carry-over from any other code path self-heals instead of crashing.
 */
describe("PrismaWorkflowRunRepository connection invocation cross-run collision", () => {
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

  it("skips invocations that belong to a different run instead of colliding on instance_id", async () => {
    const prismaClient = requireTransactionClient();
    const repository = new PrismaWorkflowRunRepository(prismaClient as never);

    const sharedInvocationId = "cinv_shared_regression_test";
    const originalInvocation: ConnectionInvocationRecord = {
      invocationId: sharedInvocationId,
      runId: "run_1" as ConnectionInvocationRecord["runId"],
      workflowId: "wf_regression" as ConnectionInvocationRecord["workflowId"],
      connectionNodeId: "llm_slot" as ConnectionInvocationRecord["connectionNodeId"],
      parentAgentNodeId: "agent_1" as ConnectionInvocationRecord["parentAgentNodeId"],
      parentAgentActivationId: "act_1" as ConnectionInvocationRecord["parentAgentActivationId"],
      status: "completed",
      managedInput: { prompt: "hello" },
      managedOutput: { text: "world" },
      queuedAt: "2026-04-18T10:00:01.000Z",
      startedAt: "2026-04-18T10:00:01.000Z",
      finishedAt: "2026-04-18T10:00:02.000Z",
      updatedAt: "2026-04-18T10:00:02.000Z",
    };

    await repository.createRun({
      runId: "run_1" as PersistedRunState["runId"],
      workflowId: "wf_regression" as PersistedRunState["workflowId"],
      startedAt: "2026-04-18T10:00:00.000Z",
    });
    await repository.save(
      buildCompletedState({
        runId: "run_1",
        workflowId: "wf_regression",
        startedAt: "2026-04-18T10:00:00.000Z",
        finishedAt: "2026-04-18T10:00:03.000Z",
        connectionInvocations: [originalInvocation],
      }),
    );

    await repository.createRun({
      runId: "run_2" as PersistedRunState["runId"],
      workflowId: "wf_regression" as PersistedRunState["workflowId"],
      startedAt: "2026-04-18T10:00:10.000Z",
    });

    await expect(
      repository.save(
        buildCompletedState({
          runId: "run_2",
          workflowId: "wf_regression",
          startedAt: "2026-04-18T10:00:10.000Z",
          finishedAt: "2026-04-18T10:00:13.000Z",
          // Reproduces the exact failure mode: a carried-over record whose `runId`
          // still points at the previous run leaks into the new run's save payload.
          connectionInvocations: [originalInvocation],
        }),
      ),
    ).resolves.toBeUndefined();

    const run1Detail = await repository.loadRunDetail("run_1");
    const run2Detail = await repository.loadRunDetail("run_2");

    expect(run1Detail?.executionInstances.some((instance) => instance.instanceId === sharedInvocationId)).toBe(true);
    expect(run2Detail?.executionInstances.some((instance) => instance.instanceId === sharedInvocationId)).toBe(false);

    const run2Loaded = await repository.load("run_2");
    expect(run2Loaded?.connectionInvocations ?? []).toHaveLength(0);
  });

  function requireTransactionClient(): unknown {
    const transaction = session.transaction;
    if (!transaction) {
      throw new Error("Integration database transaction is not ready.");
    }
    return transaction.getPrismaClient();
  }

  function buildCompletedState(
    args: Readonly<{
      runId: string;
      workflowId: string;
      startedAt: string;
      finishedAt: string;
      connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
    }>,
  ): PersistedRunState {
    return {
      runId: args.runId as PersistedRunState["runId"],
      workflowId: args.workflowId as PersistedRunState["workflowId"],
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      revision: 0,
      status: "completed",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      connectionInvocations: args.connectionInvocations,
    } satisfies PersistedRunState;
  }
});
