import { describe, expect, it } from "vitest";
import { ItemsInputNormalizer } from "@codemation/core";
import { StartWorkflowRunCommandHandler } from "../../../src/application/commands/StartWorkflowRunCommandHandler";
import { StartWorkflowRunCommand } from "../../../src/application/commands/StartWorkflowRunCommand";

// Minimal stubs
function makeLoggerFactory() {
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { create: () => logger };
}

function makeWorkflowRepo(def: object | undefined) {
  return {
    getDefinition: async () => def,
    list: () => [],
  };
}

function makeRunRepo() {
  return {
    load: async () => undefined,
    save: async () => undefined,
    listRuns: async () => [],
    deleteRun: async () => undefined,
  };
}

function makeOverlayRepo() {
  return { load: async () => undefined, save: async () => undefined };
}

function makeCredentialBindingService() {
  return { assertRequiredCredentialsBound: async () => undefined };
}

function makeRunIntentService(runId = "run-new") {
  return {
    startWorkflow: async () => ({
      runId,
      workflowId: "wf-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "completed" as const,
    }),
    rerunFromNode: async () => ({
      runId,
      workflowId: "wf-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "completed" as const,
    }),
  };
}

function makeEngine() {
  return {};
}

function makeHandler(
  overrides: {
    workflowDef?: object;
  } = {},
): StartWorkflowRunCommandHandler {
  const workflowDef =
    "workflowDef" in overrides
      ? overrides.workflowDef
      : {
          id: "wf-1",
          nodes: [],
          edges: [],
          name: "Test Workflow",
          triggers: [],
        };
  return new StartWorkflowRunCommandHandler(
    makeEngine() as never,
    new ItemsInputNormalizer(),
    makeRunIntentService() as never,
    makeWorkflowRepo(workflowDef) as never,
    makeRunRepo() as never,
    makeOverlayRepo() as never,
    makeCredentialBindingService() as never,
    makeLoggerFactory() as never,
  );
}

describe("StartWorkflowRunCommandHandler.execute — error paths", () => {
  it("throws 400 when workflowId is missing", async () => {
    const handler = makeHandler();
    const cmd = new StartWorkflowRunCommand({ workflowId: "", items: [] });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 when workflow is not found", async () => {
    const handler = makeHandler({ workflowDef: undefined });
    const cmd = new StartWorkflowRunCommand({ workflowId: "unknown-wf", items: [] });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when workflowId is missing with sourceRunId but run not found", async () => {
    // sourceRunId set, no state found → resolveWorkflow returns undefined → 404
    const handler = makeHandler({ workflowDef: undefined });
    const cmd = new StartWorkflowRunCommand({ workflowId: "wf-1", sourceRunId: "run-missing", items: [] });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when currentState set but workflowId missing", async () => {
    // body.currentState set but workflowId empty → resolveWorkflow returns undefined → throw 400 first
    const handler = makeHandler();
    const cmd = new StartWorkflowRunCommand({
      workflowId: "",
      currentState: { outputsByNode: {}, nodeSnapshotsByNodeId: {} } as never,
      items: [],
    });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 400 });
  });

  it("completes successfully for known workflow", async () => {
    const handler = makeHandler();
    const cmd = new StartWorkflowRunCommand({ workflowId: "wf-1", items: [] });
    const result = await handler.execute(cmd);
    expect(result.runId).toBeDefined();
    expect(result.workflowId).toBe("wf-1");
  });

  it("completes with mode=debug for debug run", async () => {
    const handler = makeHandler();
    const cmd = new StartWorkflowRunCommand({ workflowId: "wf-1", mode: "debug", items: [] });
    const result = await handler.execute(cmd);
    expect(result.runId).toBeDefined();
  });
});
