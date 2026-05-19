/**
 * Behavioral tests for CopyRunToWorkflowDebuggerCommandHandler.
 */
import { describe, expect, it } from "vitest";
import { CopyRunToWorkflowDebuggerCommandHandler } from "../../../src/application/commands/CopyRunToWorkflowDebuggerCommandHandler";
import { CopyRunToWorkflowDebuggerCommand } from "../../../src/application/commands/CopyRunToWorkflowDebuggerCommand";

function makeRunRepo(state: object | null = null) {
  return { load: async () => state };
}

function makeWorkflowRepo(def: object | null = null) {
  return { getDefinition: async () => def };
}

function makeOverlayRepo() {
  let saved: object | null = null;
  return {
    load: async () => null,
    save: async (overlay: object) => {
      saved = overlay;
    },
    getSaved: () => saved,
  };
}

const WORKFLOW_ID = "wf-1";
const RUN_STATE = {
  runId: "run-1",
  workflowId: WORKFLOW_ID,
  status: "completed",
  startedAt: new Date().toISOString(),
  outputsByNode: {},
  nodeSnapshotsByNodeId: {},
  workflowSnapshot: undefined,
};

const WORKFLOW_DEF = {
  id: WORKFLOW_ID,
  name: "Test Workflow",
  nodes: [{ id: "node-1", kind: "action", name: "Node 1", config: {} }],
  edges: [],
};

describe("CopyRunToWorkflowDebuggerCommandHandler.execute", () => {
  it("throws 400 when sourceRunId is missing", async () => {
    const handler = new CopyRunToWorkflowDebuggerCommandHandler(
      makeRunRepo() as never,
      makeWorkflowRepo() as never,
      makeOverlayRepo() as never,
    );
    const cmd = new CopyRunToWorkflowDebuggerCommand(WORKFLOW_ID, {});
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 when source run not found", async () => {
    const handler = new CopyRunToWorkflowDebuggerCommandHandler(
      makeRunRepo(null) as never,
      makeWorkflowRepo() as never,
      makeOverlayRepo() as never,
    );
    const cmd = new CopyRunToWorkflowDebuggerCommand(WORKFLOW_ID, { sourceRunId: "run-missing" });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when run belongs to a different workflow", async () => {
    const state = { ...RUN_STATE, workflowId: "wf-other" };
    const handler = new CopyRunToWorkflowDebuggerCommandHandler(
      makeRunRepo(state) as never,
      makeWorkflowRepo() as never,
      makeOverlayRepo() as never,
    );
    const cmd = new CopyRunToWorkflowDebuggerCommand(WORKFLOW_ID, { sourceRunId: "run-1" });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 when workflow not found", async () => {
    const handler = new CopyRunToWorkflowDebuggerCommandHandler(
      makeRunRepo(RUN_STATE) as never,
      makeWorkflowRepo(null) as never,
      makeOverlayRepo() as never,
    );
    const cmd = new CopyRunToWorkflowDebuggerCommand(WORKFLOW_ID, { sourceRunId: "run-1" });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("copies run state to debugger overlay and saves", async () => {
    const overlayRepo = makeOverlayRepo();
    const handler = new CopyRunToWorkflowDebuggerCommandHandler(
      makeRunRepo(RUN_STATE) as never,
      makeWorkflowRepo(WORKFLOW_DEF) as never,
      overlayRepo as never,
    );
    const cmd = new CopyRunToWorkflowDebuggerCommand(WORKFLOW_ID, { sourceRunId: "run-1" });
    const result = await handler.execute(cmd);
    expect(result).toBeDefined();
    expect(result.workflowId).toBe(WORKFLOW_ID);
    expect(overlayRepo.getSaved()).not.toBeNull();
  });

  it("handles URL-encoded workflowId", async () => {
    const encodedId = "wf%2F1";
    const decodedId = "wf/1";
    const state = { ...RUN_STATE, workflowId: decodedId };
    const workflowDef = { ...WORKFLOW_DEF, id: decodedId };
    const overlayRepo = makeOverlayRepo();
    const handler = new CopyRunToWorkflowDebuggerCommandHandler(
      makeRunRepo(state) as never,
      makeWorkflowRepo(workflowDef) as never,
      overlayRepo as never,
    );
    const cmd = new CopyRunToWorkflowDebuggerCommand(encodedId, { sourceRunId: "run-1" });
    const result = await handler.execute(cmd);
    expect(result.workflowId).toBe(decodedId);
  });
});
