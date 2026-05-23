import { describe, expect, it } from "vitest";
import type { PersistedRunState } from "@codemation/core";
import { ItemsInputNormalizer } from "@codemation/core";
import { SetPinnedNodeInputCommandHandler } from "../../../src/application/commands/SetPinnedNodeInputCommandHandler";
import { SetPinnedNodeInputCommand } from "../../../src/application/commands/SetPinnedNodeInputCommand";
import type { WorkflowRunRepository } from "../../../src/domain/runs/WorkflowRunRepository";

function makeRunState(overrides: Partial<PersistedRunState> = {}): PersistedRunState {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    status: "completed",
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

function makeHandler(repo: WorkflowRunRepository): SetPinnedNodeInputCommandHandler {
  return new SetPinnedNodeInputCommandHandler(repo, new ItemsInputNormalizer());
}

describe("SetPinnedNodeInputCommandHandler.execute", () => {
  it("throws 404 for unknown runId", async () => {
    const handler = makeHandler(makeRepo(undefined));
    const cmd = new SetPinnedNodeInputCommand("run-missing", "node-1", { items: undefined });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 for immutable run", async () => {
    const state = makeRunState({ executionOptions: { isMutable: false } });
    const handler = makeHandler(makeRepo(state));
    const cmd = new SetPinnedNodeInputCommand("run-1", "node-1", { items: undefined });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 403 });
  });

  it("sets pinnedOutputsByPort to undefined when items is null", async () => {
    const state = makeRunState();
    const repo = makeRepo(state);
    const handler = makeHandler(repo);
    const cmd = new SetPinnedNodeInputCommand("run-1", "node-1", { items: undefined });
    const result = await handler.execute(cmd);
    expect(result.mutableState?.nodesById["node-1"]?.pinnedOutputsByPort).toBeUndefined();
  });

  it("sets pinnedOutputsByPort when items is provided", async () => {
    const state = makeRunState();
    const repo = makeRepo(state);
    const handler = makeHandler(repo);
    const cmd = new SetPinnedNodeInputCommand("run-1", "node-1", {
      items: [{ json: { key: "value" } }],
    });
    const result = await handler.execute(cmd);
    expect(result.mutableState?.nodesById["node-1"]?.pinnedOutputsByPort).toBeDefined();
    expect(result.mutableState?.nodesById["node-1"]?.pinnedOutputsByPort?.main).toHaveLength(1);
  });

  it("URL-decodes the nodeId", async () => {
    const state = makeRunState();
    const repo = makeRepo(state);
    const handler = makeHandler(repo);
    const cmd = new SetPinnedNodeInputCommand("run-1", "node%2F1", {});
    const result = await handler.execute(cmd);
    expect(result.mutableState?.nodesById["node/1"]).toBeDefined();
  });
});
