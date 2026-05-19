import { describe, expect, it } from "vitest";
import { WorkflowDetailPresenter } from "../../src/lib/workflowDetail/WorkflowDetailPresenter";
import type { WorkflowCanvasApiClient } from "../../src/types/WorkflowCanvasApiClient";

// Minimal fake API client
function makeFakeApiClient(overrides: Partial<WorkflowCanvasApiClient> = {}): WorkflowCanvasApiClient {
  return {
    getWorkflow: async () => ({ id: "wf1", name: "W", active: true, nodes: [], edges: [] }),
    getWorkflowRuns: async () => [],
    getRunDetail: async () =>
      ({
        runId: "r1",
        workflowId: "wf1",
        status: "completed",
        queue: [],
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        startedAt: new Date().toISOString(),
      }) as never,
    postRunWorkflow: async () => ({
      runId: "r1",
      workflowId: "wf1",
      status: "pending" as const,
      startedAt: new Date().toISOString(),
      state: null,
    }),
    postRunNode: async () => ({
      runId: "r1",
      workflowId: "wf1",
      status: "pending" as const,
      startedAt: new Date().toISOString(),
      state: null,
    }),
    patchRunNodePin: async () =>
      ({
        runId: "r1",
        workflowId: "wf1",
        status: "completed" as const,
        queue: [],
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        startedAt: new Date().toISOString(),
      }) as never,
    patchRunWorkflowSnapshot: async () =>
      ({
        runId: "r1",
        workflowId: "wf1",
        status: "completed" as const,
        queue: [],
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        startedAt: new Date().toISOString(),
      }) as never,
    getWorkflowDebuggerOverlay: async () => ({ workflowId: "wf1", currentState: null, runId: null }),
    putWorkflowDebuggerOverlay: async () => ({ workflowId: "wf1", currentState: null, runId: null }),
    postWorkflowDebuggerOverlayCopyRun: async () => ({ workflowId: "wf1", currentState: null, runId: null }),
    getCredentialInstances: async () => [],
    getWorkflowCredentialHealth: async () => ({ workflowId: "wf1", slots: [] }),
    putCredentialBindings: async () => ({ ok: true }),
    ...overrides,
  } as unknown as WorkflowCanvasApiClient;
}

describe("WorkflowDetailPresenter - static methods", () => {
  describe("runNode", () => {
    it("calls postRunNode on the api client", async () => {
      let called = false;
      const fakeClient = makeFakeApiClient({
        postRunNode: async (runId, nodeId) => {
          called = true;
          expect(runId).toBe("run1");
          expect(nodeId).toBe("nodeA");
          return {
            runId: "run1",
            workflowId: "wf1",
            status: "pending" as const,
            startedAt: new Date().toISOString(),
            state: null,
          };
        },
      });
      await WorkflowDetailPresenter.runNode(fakeClient, "run1", "nodeA", undefined, "manual");
      expect(called).toBe(true);
    });
  });

  describe("updatePinnedInput", () => {
    it("calls patchRunNodePin on the api client", async () => {
      let called = false;
      const fakeClient = makeFakeApiClient({
        patchRunNodePin: async (runId, nodeId) => {
          called = true;
          expect(runId).toBe("run1");
          expect(nodeId).toBe("nodeA");
          return {} as never;
        },
      });
      await WorkflowDetailPresenter.updatePinnedInput(fakeClient, "run1", "nodeA", undefined);
      expect(called).toBe(true);
    });
  });

  describe("updateWorkflowSnapshot", () => {
    it("calls patchRunWorkflowSnapshot on the api client", async () => {
      let called = false;
      const fakeClient = makeFakeApiClient({
        patchRunWorkflowSnapshot: async (runId) => {
          called = true;
          expect(runId).toBe("run1");
          return {} as never;
        },
      });
      await WorkflowDetailPresenter.updateWorkflowSnapshot(fakeClient, "run1", { nodes: [], edges: [] });
      expect(called).toBe(true);
    });
  });

  describe("formatRunListDurationLine", () => {
    it("returns '—' when run has no finishedAt but has startedAt and status completed", () => {
      const result = WorkflowDetailPresenter.formatRunListDurationLine({
        status: "completed",
        startedAt: "2026-01-01T00:00:00Z",
        finishedAt: undefined,
      });
      expect(result).toBe("—");
    });

    it("returns duration when run has finishedAt", () => {
      const result = WorkflowDetailPresenter.formatRunListDurationLine({
        status: "completed",
        startedAt: "2026-01-01T00:00:00Z",
        finishedAt: "2026-01-01T00:00:01Z",
      });
      expect(result).toBeTruthy();
      expect(result).not.toBe("—");
    });
  });

  describe("getPreferredWorkflowNodeId", () => {
    it("returns null when workflow is undefined", () => {
      expect(WorkflowDetailPresenter.getPreferredWorkflowNodeId(undefined)).toBeNull();
    });

    it("prefers agent node", () => {
      const workflow = {
        id: "wf1",
        name: "W",
        active: true,
        nodes: [
          { id: "t1", kind: "trigger" as const, type: "ManualTrigger", name: "T" },
          { id: "n1", kind: "node" as const, type: "Agent", name: "Agent", role: "agent" as const },
        ],
        edges: [],
      };
      expect(WorkflowDetailPresenter.getPreferredWorkflowNodeId(workflow)).toBe("n1");
    });
  });

  describe("inspectorSelectionAnchorsDisplayedWorkflow", () => {
    it("returns false when nodeId is null", () => {
      expect(WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow(null, undefined)).toBe(false);
    });

    it("returns false when workflow has no nodes", () => {
      expect(
        WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow("n1", {
          id: "wf",
          name: "W",
          active: true,
          nodes: [],
          edges: [],
        }),
      ).toBe(false);
    });

    it("returns true via connection invocations", () => {
      const workflow = {
        id: "wf",
        name: "W",
        active: true,
        nodes: [{ id: "n1", kind: "node" as const, type: "X", name: "X" }],
        edges: [],
      };
      const invocations = [
        { invocationId: "inv1", nodeId: "n1", updatedAt: "2026-01-01T00:00:00Z", inputs: [], outputs: [] },
      ];
      expect(WorkflowDetailPresenter.inspectorSelectionAnchorsDisplayedWorkflow("inv1", workflow, invocations)).toBe(
        true,
      );
    });
  });

  describe("normalizeConnectionInvocations", () => {
    it("returns empty array for undefined input", () => {
      expect(WorkflowDetailPresenter.normalizeConnectionInvocations(undefined)).toEqual([]);
    });

    it("deduplicates by invocationId keeping newest", () => {
      const invocations = [
        { invocationId: "i1", updatedAt: "2026-01-01T00:00:00Z", nodeId: "n1", inputs: [], outputs: [] },
        { invocationId: "i1", updatedAt: "2026-01-01T00:00:01Z", nodeId: "n1", inputs: [], outputs: [] },
      ];
      const result = WorkflowDetailPresenter.normalizeConnectionInvocations(invocations);
      expect(result).toHaveLength(1);
      expect(result[0]?.updatedAt).toBe("2026-01-01T00:00:01Z");
    });
  });

  describe("createOptimisticTriggerFetchSnapshot", () => {
    it("returns undefined when workflow has no trigger node", () => {
      const workflow = { id: "wf1", name: "W", active: true, nodes: [], edges: [] };
      const result = WorkflowDetailPresenter.createOptimisticTriggerFetchSnapshot("wf1", workflow, {});
      expect(result).toBeUndefined();
    });

    it("returns a running snapshot when workflow starts with a trigger and no request items", () => {
      const workflow = {
        id: "wf1",
        name: "W",
        active: true,
        nodes: [{ id: "t1", kind: "trigger" as const, type: "ManualTrigger", name: "T" }],
        edges: [],
      };
      const result = WorkflowDetailPresenter.createOptimisticTriggerFetchSnapshot("wf1", workflow, {});
      expect(result).toBeDefined();
      expect(result?.status).toBe("running");
      expect(result?.nodeId).toBe("t1");
    });
  });
});
