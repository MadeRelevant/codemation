/**
 * Behavioral tests for WorkflowHttpRouteHandler and RunHttpRouteHandler.
 * Exercises all methods including error paths and 404 branches.
 */
import { describe, expect, it } from "vitest";
import { WorkflowHttpRouteHandler } from "../../src/presentation/http/routeHandlers/WorkflowHttpRouteHandler";
import { RunHttpRouteHandler } from "../../src/presentation/http/routeHandlers/RunHttpRouteHandler";
import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import type { McpServerCatalog } from "../../src/mcp/McpServerCatalog";

// ── Stubs ──────────────────────────────────────────────────────────────────────

function makeQueryBus(result: unknown) {
  return { execute: async () => result };
}

function makeCommandBus(result: unknown = {}) {
  return { execute: async () => result };
}

function makeWorkflowMapper() {
  const policyUi = { workflowHasErrorHandler: () => false };
  const activationPolicy = { isActive: () => false };
  return new WorkflowDefinitionMapper(
    policyUi as never,
    activationPolicy as never,
    { get: () => undefined } as unknown as McpServerCatalog,
  );
}

const EMPTY_PARAMS = {};
const WORKFLOW_PARAMS = { workflowId: "wf-1" };
const RUN_PARAMS = { runId: "run-1" };
const NODE_PARAMS = { runId: "run-1", nodeId: "node-1" };

function makeJsonRequest(body: unknown, path = "http://localhost/api") {
  return new Request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── WorkflowHttpRouteHandler ────────────────────────────────────────────────

describe("WorkflowHttpRouteHandler", () => {
  describe("getWorkflows", () => {
    it("returns workflow summaries", async () => {
      const workflows = [{ id: "wf-1", name: "Workflow 1", nodes: [], edges: [], triggers: [] }];
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(workflows) as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflows(new Request("http://localhost"), EMPTY_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new WorkflowHttpRouteHandler(
        {
          execute: async () => {
            throw new Error("db error");
          },
        } as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflows(new Request("http://localhost"), EMPTY_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("getWorkflow", () => {
    it("returns 404 when workflow not found", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflow(new Request("http://localhost"), WORKFLOW_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns workflow detail when found", async () => {
      const workflow = {
        id: "wf-1",
        name: "Workflow 1",
        nodes: [],
        edges: [],
        triggers: [],
      };
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(workflow) as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflow(new Request("http://localhost"), WORKFLOW_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new WorkflowHttpRouteHandler(
        {
          execute: async () => {
            throw new Error("db error");
          },
        } as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflow(new Request("http://localhost"), WORKFLOW_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("patchWorkflowActivation", () => {
    it("returns 400 when active field is not boolean", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ active: "yes" });
      const res = await handler.patchWorkflowActivation(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(400);
    });

    it("activates workflow when active=true", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        makeCommandBus({ workflowId: "wf-1", isActive: true }) as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ active: true });
      const res = await handler.patchWorkflowActivation(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(200);
    });

    it("deactivates workflow when active=false", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        makeCommandBus({ workflowId: "wf-1", isActive: false }) as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ active: false });
      const res = await handler.patchWorkflowActivation(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        {
          execute: async () => {
            throw new Error("cmd error");
          },
        } as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ active: true });
      const res = await handler.patchWorkflowActivation(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("getWorkflowRuns", () => {
    it("returns run list", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus([]) as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflowRuns(new Request("http://localhost"), WORKFLOW_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new WorkflowHttpRouteHandler(
        {
          execute: async () => {
            throw new Error("runs error");
          },
        } as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflowRuns(new Request("http://localhost"), WORKFLOW_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("getWorkflowDebuggerOverlay", () => {
    it("returns overlay (null is valid)", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        makeCommandBus() as never,
        makeWorkflowMapper(),
      );
      const res = await handler.getWorkflowDebuggerOverlay(new Request("http://localhost"), WORKFLOW_PARAMS);
      expect(res.status).toBe(200);
    });
  });

  describe("putWorkflowDebuggerOverlay", () => {
    it("updates debugger overlay", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        makeCommandBus({ workflowId: "wf-1" }) as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ currentState: {} });
      const res = await handler.putWorkflowDebuggerOverlay(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        {
          execute: async () => {
            throw new Error("overlay error");
          },
        } as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ currentState: {} });
      const res = await handler.putWorkflowDebuggerOverlay(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("postCopyWorkflowDebuggerOverlay", () => {
    it("copies run to debugger overlay", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        makeCommandBus({ workflowId: "wf-1" }) as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ sourceRunId: "run-1" });
      const res = await handler.postCopyWorkflowDebuggerOverlay(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new WorkflowHttpRouteHandler(
        makeQueryBus(null) as never,
        {
          execute: async () => {
            throw new Error("copy error");
          },
        } as never,
        makeWorkflowMapper(),
      );
      const req = makeJsonRequest({ sourceRunId: "run-1" });
      const res = await handler.postCopyWorkflowDebuggerOverlay(req, WORKFLOW_PARAMS);
      expect(res.status).toBe(500);
    });
  });
});

// ── RunHttpRouteHandler ─────────────────────────────────────────────────────

describe("RunHttpRouteHandler", () => {
  describe("getRun", () => {
    it("returns 404 when run not found", async () => {
      const handler = new RunHttpRouteHandler(makeQueryBus(null) as never, makeCommandBus() as never);
      const res = await handler.getRun(new Request("http://localhost"), RUN_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns run state when found", async () => {
      const state = { runId: "run-1", status: "completed", workflowId: "wf-1" };
      const handler = new RunHttpRouteHandler(makeQueryBus(state) as never, makeCommandBus() as never);
      const res = await handler.getRun(new Request("http://localhost"), RUN_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new RunHttpRouteHandler(
        {
          execute: async () => {
            throw new Error("db error");
          },
        } as never,
        makeCommandBus() as never,
      );
      const res = await handler.getRun(new Request("http://localhost"), RUN_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("getRunDetail", () => {
    it("returns 404 when run detail not found", async () => {
      const handler = new RunHttpRouteHandler(makeQueryBus(null) as never, makeCommandBus() as never);
      const res = await handler.getRunDetail(new Request("http://localhost"), RUN_PARAMS);
      expect(res.status).toBe(404);
    });

    it("returns run detail when found", async () => {
      const detail = { runId: "run-1", nodes: [] };
      const handler = new RunHttpRouteHandler(makeQueryBus(detail) as never, makeCommandBus() as never);
      const res = await handler.getRunDetail(new Request("http://localhost"), RUN_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new RunHttpRouteHandler(
        {
          execute: async () => {
            throw new Error("detail error");
          },
        } as never,
        makeCommandBus() as never,
      );
      const res = await handler.getRunDetail(new Request("http://localhost"), RUN_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("postRuns", () => {
    it("starts a run and returns result", async () => {
      const result = { runId: "run-new", workflowId: "wf-1", status: "running" };
      const handler = new RunHttpRouteHandler(makeQueryBus(null) as never, makeCommandBus(result) as never);
      const req = makeJsonRequest({ workflowId: "wf-1", items: [] });
      const res = await handler.postRuns(req, EMPTY_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new RunHttpRouteHandler(
        makeQueryBus(null) as never,
        {
          execute: async () => {
            throw new Error("cmd error");
          },
        } as never,
      );
      const req = makeJsonRequest({ workflowId: "wf-1", items: [] });
      const res = await handler.postRuns(req, EMPTY_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("patchRunWorkflowSnapshot", () => {
    it("replaces workflow snapshot and returns result", async () => {
      const result = { success: true };
      const handler = new RunHttpRouteHandler(makeQueryBus(null) as never, makeCommandBus(result) as never);
      const req = makeJsonRequest({ workflowSnapshot: {} });
      const res = await handler.patchRunWorkflowSnapshot(req, RUN_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new RunHttpRouteHandler(
        makeQueryBus(null) as never,
        {
          execute: async () => {
            throw new Error("cmd error");
          },
        } as never,
      );
      const req = makeJsonRequest({ workflowSnapshot: {} });
      const res = await handler.patchRunWorkflowSnapshot(req, RUN_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("patchRunNodePin", () => {
    it("sets pinned node input and returns result", async () => {
      const result = { pinned: true };
      const handler = new RunHttpRouteHandler(makeQueryBus(null) as never, makeCommandBus(result) as never);
      const req = makeJsonRequest({ items: [] });
      const res = await handler.patchRunNodePin(req, NODE_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new RunHttpRouteHandler(
        makeQueryBus(null) as never,
        {
          execute: async () => {
            throw new Error("pin error");
          },
        } as never,
      );
      const req = makeJsonRequest({ items: [] });
      const res = await handler.patchRunNodePin(req, NODE_PARAMS);
      expect(res.status).toBe(500);
    });
  });

  describe("postRunNode", () => {
    it("replays a workflow node and returns result", async () => {
      const result = { runId: "run-1", status: "completed" };
      const handler = new RunHttpRouteHandler(makeQueryBus(null) as never, makeCommandBus(result) as never);
      const req = makeJsonRequest({ items: [] });
      const res = await handler.postRunNode(req, NODE_PARAMS);
      expect(res.status).toBe(200);
    });

    it("returns 500 on unexpected error", async () => {
      const handler = new RunHttpRouteHandler(
        makeQueryBus(null) as never,
        {
          execute: async () => {
            throw new Error("node error");
          },
        } as never,
      );
      const req = makeJsonRequest({ items: [] });
      const res = await handler.postRunNode(req, NODE_PARAMS);
      expect(res.status).toBe(500);
    });
  });
});
