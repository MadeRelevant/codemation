import assert from "node:assert/strict";
import { Hono } from "hono";
import { describe, test } from "vitest";

import { ApplicationRequestError } from "../../src/application/ApplicationRequestError";
import { InternalCredentialsBindingRegistrar } from "../../src/credentials/InternalCredentialsBindingRegistrar";

// ── Minimal stubs ─────────────────────────────────────────────────────────────

class StubHmacMiddleware {
  handle() {
    return async (_c: unknown, next: () => Promise<void>) => next();
  }
}

class RejectingHmacMiddleware {
  handle() {
    return async (c: { json: (body: unknown, status: number) => unknown }) => c.json({ error: "unauthorized" }, 401);
  }
}

type UpsertArgs = Readonly<{ workflowId: string; nodeId: string; slotKey: string; instanceId: string }>;

class StubBindingService {
  upserts: UpsertArgs[] = [];
  error: ApplicationRequestError | undefined;

  async upsertBinding(args: UpsertArgs) {
    if (this.error) throw this.error;
    this.upserts.push(args);
    return {
      key: { workflowId: args.workflowId, nodeId: args.nodeId, slotKey: args.slotKey },
      instanceId: args.instanceId,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }
}

const stubLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const stubLoggerFactory = { create: () => stubLogger };

function buildApp(
  service: StubBindingService,
  hmac: StubHmacMiddleware | RejectingHmacMiddleware = new StubHmacMiddleware(),
) {
  const registrar = new InternalCredentialsBindingRegistrar(
    hmac as never,
    service as never,
    stubLoggerFactory as never,
  );
  const app = new Hono();
  registrar.register(app);
  return app;
}

async function bindRequest(app: Hono, body: Record<string, unknown>) {
  return app.request("/internal/credentials/binding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  workflowId: "wf-1",
  nodeId: "node-1",
  slotKey: "gmail",
  credentialInstanceId: "inst-1",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InternalCredentialsBindingRegistrar — POST /internal/credentials/binding", () => {
  test("upserts a binding on a valid request", async () => {
    const service = new StubBindingService();
    const app = buildApp(service);

    const res = await bindRequest(app, VALID_BODY);

    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(json.ok, true);
    assert.equal(service.upserts.length, 1);
    assert.deepEqual(service.upserts[0], {
      workflowId: "wf-1",
      nodeId: "node-1",
      slotKey: "gmail",
      instanceId: "inst-1",
    });
  });

  test("returns 400 if workflowId is missing", async () => {
    const service = new StubBindingService();
    const app = buildApp(service);
    const { workflowId: _omit, ...body } = VALID_BODY;
    void _omit;

    const res = await bindRequest(app, body);

    assert.equal(res.status, 400);
    assert.equal(service.upserts.length, 0);
  });

  test("returns 400 if nodeId is missing", async () => {
    const service = new StubBindingService();
    const app = buildApp(service);
    const { nodeId: _omit, ...body } = VALID_BODY;
    void _omit;

    const res = await bindRequest(app, body);

    assert.equal(res.status, 400);
  });

  test("returns 400 if slotKey is missing", async () => {
    const service = new StubBindingService();
    const app = buildApp(service);
    const { slotKey: _omit, ...body } = VALID_BODY;
    void _omit;

    const res = await bindRequest(app, body);

    assert.equal(res.status, 400);
  });

  test("returns 400 if credentialInstanceId is missing", async () => {
    const service = new StubBindingService();
    const app = buildApp(service);
    const { credentialInstanceId: _omit, ...body } = VALID_BODY;
    void _omit;

    const res = await bindRequest(app, body);

    assert.equal(res.status, 400);
  });

  test("propagates ApplicationRequestError status (e.g. type-incompatibility)", async () => {
    const service = new StubBindingService();
    service.error = new ApplicationRequestError(400, "Credential instance type mismatch");
    const app = buildApp(service);

    const res = await bindRequest(app, VALID_BODY);

    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.equal(json.error, "Credential instance type mismatch");
  });

  test("rejects unauthenticated requests (HMAC middleware short-circuits)", async () => {
    const service = new StubBindingService();
    const app = buildApp(service, new RejectingHmacMiddleware());

    const res = await bindRequest(app, VALID_BODY);

    assert.equal(res.status, 401);
    assert.equal(service.upserts.length, 0);
  });
});
