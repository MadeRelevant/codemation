import { describe, expect, it } from "vitest";
import type { PersistedRunState } from "@codemation/core";
import { WorkflowRunRepository } from "../../src/infrastructure/persistence/WorkflowRunRepository";

function makeState(runId: string): PersistedRunState {
  return {
    runId,
    workflowId: "wf-1",
    status: "completed",
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
    startedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as PersistedRunState;
}

describe("WorkflowRunRepository", () => {
  it("load delegates to workflowExecutionRepository and decodes runId", async () => {
    const state = makeState("run/1");
    const inner = {
      load: async (id: string) => (id === "run/1" ? state : undefined),
      save: async () => undefined,
    };
    const repo = new WorkflowRunRepository(inner as never);
    const result = await repo.load("run%2F1");
    expect(result).toBe(state);
  });

  it("load returns undefined for unknown run", async () => {
    const inner = {
      load: async () => undefined,
      save: async () => undefined,
    };
    const repo = new WorkflowRunRepository(inner as never);
    expect(await repo.load("missing")).toBeUndefined();
  });

  it("save delegates to inner repository", async () => {
    const saved: PersistedRunState[] = [];
    const inner = {
      load: async () => undefined,
      save: async (s: PersistedRunState) => {
        saved.push(s);
      },
    };
    const repo = new WorkflowRunRepository(inner as never);
    const state = makeState("run-1");
    await repo.save(state);
    expect(saved).toHaveLength(1);
    expect(saved[0].runId).toBe("run-1");
  });

  it("listRuns returns empty array when inner lacks listRuns", async () => {
    const inner = {
      load: async () => undefined,
      save: async () => undefined,
      // No listRuns property
    };
    const repo = new WorkflowRunRepository(inner as never);
    const result = await repo.listRuns({});
    expect(result).toEqual([]);
  });

  it("listRuns delegates to inner.listRuns and decodes workflowId", async () => {
    const inner = {
      load: async () => undefined,
      save: async () => undefined,
      listRuns: async (args: { workflowId?: string }) => {
        return args.workflowId === "wf/1" ? [{ runId: "run-1", workflowId: "wf/1", status: "completed" }] : [];
      },
    };
    const repo = new WorkflowRunRepository(inner as never);
    const result = await repo.listRuns({ workflowId: "wf%2F1" });
    expect(result).toHaveLength(1);
  });

  it("deleteRun is a no-op when inner lacks deleteRun", async () => {
    const inner = {
      load: async () => undefined,
      save: async () => undefined,
      // No deleteRun property
    };
    const repo = new WorkflowRunRepository(inner as never);
    await expect(repo.deleteRun("run-1" as never)).resolves.toBeUndefined();
  });

  it("deleteRun delegates to inner.deleteRun and decodes id", async () => {
    const deleted: string[] = [];
    const inner = {
      load: async () => undefined,
      save: async () => undefined,
      deleteRun: async (id: string) => {
        deleted.push(id);
      },
    };
    const repo = new WorkflowRunRepository(inner as never);
    await repo.deleteRun("run%2F1" as never);
    expect(deleted).toEqual(["run/1"]);
  });
});
