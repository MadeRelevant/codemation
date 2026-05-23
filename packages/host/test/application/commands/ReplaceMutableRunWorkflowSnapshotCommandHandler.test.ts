import { describe, expect, it } from "vitest";
import type { PersistedRunState } from "@codemation/core";
import { ReplaceMutableRunWorkflowSnapshotCommandHandler } from "../../../src/application/commands/ReplaceMutableRunWorkflowSnapshotCommandHandler";
import { ReplaceMutableRunWorkflowSnapshotCommand } from "../../../src/application/commands/ReplaceMutableRunWorkflowSnapshotCommand";
import type { WorkflowRunRepository } from "../../../src/domain/runs/WorkflowRunRepository";

function makeRunState(overrides: Partial<PersistedRunState> = {}): PersistedRunState {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    status: "running",
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
    mutableState: undefined,
    executionOptions: { isMutable: true },
    startedAt: "2026-01-01T00:00:00.000Z",
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

function makeHandler(repo: WorkflowRunRepository): ReplaceMutableRunWorkflowSnapshotCommandHandler {
  return new ReplaceMutableRunWorkflowSnapshotCommandHandler(repo);
}

describe("ReplaceMutableRunWorkflowSnapshotCommandHandler.execute", () => {
  it("throws 400 when workflowSnapshot is missing", async () => {
    const handler = makeHandler(makeRepo(makeRunState()));
    const cmd = new ReplaceMutableRunWorkflowSnapshotCommand("run-1", { workflowSnapshot: undefined } as never);
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 when run is not found", async () => {
    const handler = makeHandler(makeRepo(undefined));
    const cmd = new ReplaceMutableRunWorkflowSnapshotCommand("run-missing", {
      workflowSnapshot: { id: "wf-1" } as never,
    });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when run is immutable", async () => {
    const state = makeRunState({ executionOptions: { isMutable: false } });
    const handler = makeHandler(makeRepo(state));
    const cmd = new ReplaceMutableRunWorkflowSnapshotCommand("run-1", { workflowSnapshot: { id: "wf-1" } as never });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 403 });
  });

  it("replaces workflowSnapshot and resets run state on success", async () => {
    const state = makeRunState({
      outputsByNode: { "node-1": { main: [{ json: { result: 42 } }] } } as never,
    });
    const repo = makeRepo(state);
    const handler = makeHandler(repo);
    const newSnapshot = { id: "wf-snapshot-v2", nodes: [] } as never;
    const cmd = new ReplaceMutableRunWorkflowSnapshotCommand("run-1", { workflowSnapshot: newSnapshot });
    const result = await handler.execute(cmd);
    expect(result.workflowSnapshot).toEqual(newSnapshot);
    expect(result.status).toBe("completed");
    expect(result.outputsByNode).toEqual({});
  });
});
