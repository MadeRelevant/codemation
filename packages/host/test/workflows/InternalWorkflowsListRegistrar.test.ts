import assert from "node:assert/strict";
import { test, describe } from "vitest";
import { Hono } from "hono";
import { AllWorkflowsActiveWorkflowActivationPolicy, type WorkflowDefinition } from "@codemation/core";
import { InternalWorkflowsListRegistrar } from "../../src/workflows/InternalWorkflowsListRegistrar";
import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";
import type { McpServerCatalog } from "../../src/mcp/McpServerCatalog";

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
    { get: () => undefined } as unknown as McpServerCatalog,
  );
}

function makeQueryBus(workflows: WorkflowDefinition[]): { execute: () => Promise<WorkflowDefinition[]> } {
  return { execute: async () => workflows };
}

function buildApp(workflows: WorkflowDefinition[], rejectHmac = false) {
  const hmac = rejectHmac ? new StubHmacMiddlewareReject() : new StubHmacMiddleware();
  const registrar = new InternalWorkflowsListRegistrar(hmac as never, makeQueryBus(workflows) as never, makeMapper());
  const app = new Hono();
  registrar.register(app);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InternalWorkflowsListRegistrar — GET /internal/workflows", () => {
  test("returns empty array when no workflows exist", async () => {
    const app = buildApp([]);

    const res = await app.request("/internal/workflows", { method: "GET" });

    assert.equal(res.status, 200);
    const body = (await res.json()) as unknown[];
    assert.deepEqual(body, []);
  });

  test("returns workflow summaries with expected shape", async () => {
    const wf = minimalWorkflow({ id: "wf-1", name: "My Workflow" });
    const app = buildApp([wf]);

    const res = await app.request("/internal/workflows", { method: "GET" });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    assert.equal(body.length, 1);
    const entry = body[0]!;
    assert.equal(entry.id, "wf-1");
    assert.equal(entry.name, "My Workflow");
    assert.equal(entry.active, true);
    assert.deepEqual(entry.discoveryPathSegments, []);
  });

  test("returns 401 when HMAC auth fails", async () => {
    const app = buildApp([], true);

    const res = await app.request("/internal/workflows", { method: "GET" });

    assert.equal(res.status, 401);
  });
});
