import { describe, expect, it } from "vitest";
import type { PersistedRunState, WorkflowDefinition } from "@codemation/core";
import { ItemsInputNormalizer } from "@codemation/core";
import { ReplayWorkflowNodeCommandHandler } from "../../../src/application/commands/ReplayWorkflowNodeCommandHandler";
import { ReplayWorkflowNodeCommand } from "../../../src/application/commands/ReplayWorkflowNodeCommand";
import type { WorkflowRunRepository } from "../../../src/domain/runs/WorkflowRunRepository";

function makeRunState(overrides: Partial<PersistedRunState> = {}): PersistedRunState {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    status: "completed",
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
    mutableState: undefined,
    executionOptions: { isMutable: true, mode: "manual" },
    startedAt: "2026-01-01T00:00:00.000Z",
    workflowSnapshot: undefined,
    ...overrides,
  } as unknown as PersistedRunState;
}

function makeRepo(state: PersistedRunState | undefined): WorkflowRunRepository {
  const store: PersistedRunState[] = state ? [state] : [];
  return {
    load: async (runId: string) => store.find((s) => s.runId === runId),
    save: async (s: PersistedRunState) => {
      const idx = store.findIndex((x) => x.runId === s.runId);
      if (idx >= 0) store[idx] = s;
      else store.push(s);
    },
    listRuns: async () => [],
    deleteRun: async () => undefined,
  };
}

function makeEngine(workflow: WorkflowDefinition | null): object {
  return {
    resolveWorkflowSnapshot: () => workflow ?? undefined,
    waitForCompletion: async (runId: string) => ({
      runId,
      workflowId: "wf-1",
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
    }),
  };
}

function makeRunIntentService(resultRunId = "run-result"): object {
  return {
    rerunFromNode: async () => ({
      runId: resultRunId,
      workflowId: "wf-1",
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
    }),
  };
}

const testWorkflow = { id: "wf-1", nodes: [], connections: [] } as unknown as WorkflowDefinition;

function makeHandler(
  repo: WorkflowRunRepository,
  workflow: WorkflowDefinition | null = testWorkflow,
  resultRunId = "run-result",
): ReplayWorkflowNodeCommandHandler {
  const resultState = makeRunState({ runId: resultRunId });
  const repoWithResult: WorkflowRunRepository = {
    ...repo,
    load: async (runId: string) => {
      if (runId === resultRunId) return resultState;
      return (repo.load as (id: string) => Promise<PersistedRunState | undefined>)(runId);
    },
  };
  return new ReplayWorkflowNodeCommandHandler(
    makeEngine(workflow) as never,
    new ItemsInputNormalizer(),
    makeRunIntentService(resultRunId) as never,
    repoWithResult,
  );
}

describe("ReplayWorkflowNodeCommandHandler.execute", () => {
  it("throws 404 for unknown runId", async () => {
    const handler = makeHandler(makeRepo(undefined));
    const cmd = new ReplayWorkflowNodeCommand("run-missing", "node-1", {});
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 for immutable run", async () => {
    const state = makeRunState({ executionOptions: { isMutable: false } });
    const handler = makeHandler(makeRepo(state));
    const cmd = new ReplayWorkflowNodeCommand("run-1", "node-1", {});
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 404 when workflow cannot be resolved", async () => {
    const state = makeRunState();
    const handler = makeHandler(makeRepo(state), null);
    const cmd = new ReplayWorkflowNodeCommand("run-1", "node-1", {});
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("returns run result on success", async () => {
    const state = makeRunState();
    const handler = makeHandler(makeRepo(state));
    const cmd = new ReplayWorkflowNodeCommand("run-1", "node-1", {});
    const result = await handler.execute(cmd);
    expect(result.runId).toBe("run-result");
    expect(result.status).toBe("completed");
  });

  it("URL-decodes the nodeId", async () => {
    let capturedNodeId: string | undefined;
    const state = makeRunState();
    const repo = makeRepo(state);
    const resultState = makeRunState({ runId: "run-result" });
    const repoWithResult: WorkflowRunRepository = {
      ...repo,
      load: async (runId: string) => {
        if (runId === "run-result") return resultState;
        return repo.load(runId);
      },
    };
    const runIntentService = {
      rerunFromNode: async (args: { nodeId: string }) => {
        capturedNodeId = args.nodeId;
        return { runId: "run-result", workflowId: "wf-1", status: "completed", startedAt: "2026-01-01T00:00:00.000Z" };
      },
    };
    const handler = new ReplayWorkflowNodeCommandHandler(
      makeEngine(testWorkflow) as never,
      new ItemsInputNormalizer(),
      runIntentService as never,
      repoWithResult,
    );
    await handler.execute(new ReplayWorkflowNodeCommand("run-1", "node%2F1", {}));
    expect(capturedNodeId).toBe("node/1");
  });

  it("uses mode from body when provided", async () => {
    let capturedMode: string | undefined;
    const state = makeRunState();
    const repo = makeRepo(state);
    const resultState = makeRunState({ runId: "run-result" });
    const repoWithResult: WorkflowRunRepository = {
      ...repo,
      load: async (runId: string) => {
        if (runId === "run-result") return resultState;
        return repo.load(runId);
      },
    };
    const runIntentService = {
      rerunFromNode: async (args: { executionOptions: { mode: string } }) => {
        capturedMode = args.executionOptions.mode;
        return { runId: "run-result", workflowId: "wf-1", status: "completed", startedAt: "2026-01-01T00:00:00.000Z" };
      },
    };
    const handler = new ReplayWorkflowNodeCommandHandler(
      makeEngine(testWorkflow) as never,
      new ItemsInputNormalizer(),
      runIntentService as never,
      repoWithResult,
    );
    await handler.execute(new ReplayWorkflowNodeCommand("run-1", "node-1", { mode: "debug" }));
    expect(capturedMode).toBe("debug");
  });
});
