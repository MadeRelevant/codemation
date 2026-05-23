import { describe, expect, it } from "vitest";
import { GetWorkflowRunDetailQueryHandler } from "../../src/application/queries/GetWorkflowRunDetailQueryHandler";
import { GetWorkflowRunDetailQuery } from "../../src/application/queries/GetWorkflowRunDetailQuery";
import { RunIterationProjectionFactory } from "../../src/application/queries/RunIterationProjectionFactory";
import type { WorkflowRunRepository } from "../../src/domain/runs/WorkflowRunRepository";

function makeRepo(detail: object | undefined): WorkflowRunRepository {
  return {
    load: async () => undefined,
    save: async () => undefined,
    listRuns: async () => [],
    deleteRun: async () => undefined,
    loadRunDetail: async () => detail as never,
  } as never;
}

function makeIterationCostHandler(rollups: object[] = []): object {
  return {
    execute: async () => rollups,
  };
}

function makeHandler(repo: WorkflowRunRepository, rollups: object[] = []): GetWorkflowRunDetailQueryHandler {
  return new GetWorkflowRunDetailQueryHandler(
    repo,
    new RunIterationProjectionFactory(),
    makeIterationCostHandler(rollups) as never,
  );
}

describe("GetWorkflowRunDetailQueryHandler.execute", () => {
  it("returns undefined when run detail is not found", async () => {
    const handler = makeHandler(makeRepo(undefined));
    const result = await handler.execute(new GetWorkflowRunDetailQuery("run-missing"));
    expect(result).toBeUndefined();
  });

  it("returns detail with empty iterations when there are no execution instances", async () => {
    const detail = {
      runId: "run-1",
      workflowId: "wf-1",
      status: "completed",
      executionInstances: [],
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    const handler = makeHandler(makeRepo(detail));
    const result = await handler.execute(new GetWorkflowRunDetailQuery("run-1"));
    expect(result).toBeDefined();
    expect(result!.iterations).toHaveLength(0);
  });

  it("returns detail without cost when rollups are empty", async () => {
    const detail = {
      runId: "run-1",
      workflowId: "wf-1",
      status: "completed",
      executionInstances: [
        {
          kind: "connectionInvocation",
          iterationId: "iter-1",
          activationId: "act-1",
          slotNodeId: "n1",
          connectionName: "my-llm",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    const handler = makeHandler(makeRepo(detail), []);
    const result = (await handler.execute(new GetWorkflowRunDetailQuery("run-1")))!;
    expect(result).toBeDefined();
    const iterations = result.iterations ?? [];
    expect(iterations).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((iterations.at(0) as any)?.estimatedCostMinorByCurrency).toBeUndefined();
  });

  it("joins iteration costs from rollups by iterationId", async () => {
    const detail = {
      runId: "run-1",
      workflowId: "wf-1",
      status: "completed",
      executionInstances: [
        {
          kind: "connectionInvocation",
          iterationId: "iter-1",
          activationId: "act-1",
          slotNodeId: "n1",
          connectionName: "my-llm",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    const rollups = [
      {
        iterationId: "iter-1",
        estimatedCostMinorByCurrency: { USD: 42 },
        estimatedCostCurrencyScaleByCurrency: { USD: 2 },
      },
    ];
    const handler = makeHandler(makeRepo(detail), rollups);
    const result = (await handler.execute(new GetWorkflowRunDetailQuery("run-1")))!;
    expect(result).toBeDefined();
    const iterations = result.iterations ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((iterations.at(0) as any)?.estimatedCostMinorByCurrency).toEqual({ USD: 42 });
  });
});
