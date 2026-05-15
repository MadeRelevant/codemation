import assert from "node:assert/strict";
import { test, describe } from "vitest";
import { Hono } from "hono";
import { AllWorkflowsActiveWorkflowActivationPolicy, type WorkflowDefinition } from "@codemation/core";
import { InternalWorkflowDetailRegistrar } from "../../src/workflows/InternalWorkflowDetailRegistrar";
import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";

// ── Stubs ─────────────────────────────────────────────────────────────────────

class StubHmacMiddleware {
  handle() {
    return async (_c: unknown, next: () => Promise<void>) => next();
  }
}

class StubHmacMiddlewareReject {
  handle() {
    return async (c: { json: (body: unknown, status: number) => unknown }, _next: () => Promise<void>) =>
      c.json({ error: "Unauthorized" }, 401);
  }
}

function minimalWorkflow(args: Readonly<{ id: string; name: string }>): WorkflowDefinition {
  return { id: args.id, name: args.name, nodes: [], edges: [] };
}

function makeMapper(): WorkflowDefinitionMapper {
  return new WorkflowDefinitionMapper(
    new WorkflowPolicyUiPresentationFactory(),
    new AllWorkflowsActiveWorkflowActivationPolicy(),
  );
}

function makeQueryBus(workflowById: Map<string, WorkflowDefinition>): {
  execute: (query: { workflowId?: string }) => Promise<WorkflowDefinition | undefined>;
} {
  return {
    execute: async (query) => {
      if (!("workflowId" in query)) return undefined;
      return workflowById.get((query as { workflowId: string }).workflowId);
    },
  };
}

function buildApp(workflowById: Map<string, WorkflowDefinition>, rejectHmac = false) {
  const hmac = rejectHmac ? new StubHmacMiddlewareReject() : new StubHmacMiddleware();
  const registrar = new InternalWorkflowDetailRegistrar(
    hmac as never,
    makeQueryBus(workflowById) as never,
    makeMapper(),
  );
  const app = new Hono();
  registrar.register(app);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InternalWorkflowDetailRegistrar — GET /internal/workflows/:workflowId", () => {
  test("returns 200 with workflow DTO for a known workflow", async () => {
    const wf = minimalWorkflow({ id: "wf-1", name: "My Workflow" });
    const app = buildApp(new Map([["wf-1", wf]]));

    const res = await app.request("/internal/workflows/wf-1", { method: "GET" });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.id, "wf-1");
    assert.equal(body.name, "My Workflow");
    assert.equal(body.active, true);
    assert.ok(Array.isArray(body.nodes));
    assert.ok(Array.isArray(body.edges));
  });

  test("returns 404 with empty body when workflow does not exist", async () => {
    const app = buildApp(new Map());

    const res = await app.request("/internal/workflows/unknown-id", { method: "GET" });

    assert.equal(res.status, 404);
    const text = await res.text();
    assert.equal(text, "");
  });

  test("returns 401 when HMAC auth fails", async () => {
    const wf = minimalWorkflow({ id: "wf-1", name: "My Workflow" });
    const app = buildApp(new Map([["wf-1", wf]]), true);

    const res = await app.request("/internal/workflows/wf-1", { method: "GET" });

    assert.equal(res.status, 401);
  });
});
