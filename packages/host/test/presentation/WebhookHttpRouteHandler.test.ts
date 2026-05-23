/**
 * Behavioral tests for WebhookHttpRouteHandler.
 * Covers notFound, methodNotAllowed, and success paths.
 */
import { describe, expect, it } from "vitest";
import { WebhookHttpRouteHandler } from "../../src/presentation/http/routeHandlers/WebhookHttpRouteHandler";

function makeHandler(
  opts: {
    resolution?: { status: "notFound" | "methodNotAllowed" | "found"; match?: object };
    commandResult?: unknown;
  } = {},
) {
  const resolution = opts.resolution ?? {
    status: "found",
    match: { workflowId: "wf-1", nodeId: "trig-1", triggerKind: "webhook" },
  };
  const commandBus = {
    execute: async () => opts.commandResult ?? { runId: "run-new", status: "running" },
  };
  const runIntentService = {
    resolveWebhookTrigger: () => resolution,
  };
  const webhookItemMapper = {
    map: async () => ({
      json: { method: "POST", body: {} },
      binary: [],
    }),
  };

  return new WebhookHttpRouteHandler(commandBus as never, runIntentService as never, webhookItemMapper as never);
}

describe("WebhookHttpRouteHandler.postWebhook", () => {
  it("returns 404 when webhook endpoint not found", async () => {
    const handler = makeHandler({ resolution: { status: "notFound" } });
    const req = new Request("http://localhost/api/webhooks/unknown");
    const res = await handler.postWebhook(req, { endpointPath: "unknown" });
    expect(res.status).toBe(404);
  });

  it("returns 405 when method not allowed", async () => {
    const handler = makeHandler({ resolution: { status: "methodNotAllowed" } });
    const req = new Request("http://localhost/api/webhooks/my-hook", { method: "DELETE" });
    const res = await handler.postWebhook(req, { endpointPath: "my-hook" });
    expect(res.status).toBe(405);
  });

  it("returns 200 on successful webhook invocation", async () => {
    const handler = makeHandler({
      resolution: { status: "found", match: { workflowId: "wf-1", nodeId: "trig-1" } },
    });
    const req = new Request("http://localhost/api/webhooks/my-hook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "test" }),
    });
    const res = await handler.postWebhook(req, { endpointPath: "my-hook" });
    expect(res.status).toBe(200);
  });

  it("handles URL-encoded endpointPath", async () => {
    const handler = makeHandler({
      resolution: { status: "found", match: {} },
    });
    const req = new Request("http://localhost/api/webhooks/my%2Fhook");
    const res = await handler.postWebhook(req, { endpointPath: "my%2Fhook" });
    expect(res.status).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    const commandBus = {
      execute: async () => {
        throw new Error("cmd error");
      },
    };
    const runIntentService = {
      resolveWebhookTrigger: () => ({ status: "found", match: {} }),
    };
    const webhookItemMapper = { map: async () => ({ json: {} }) };
    const handler = new WebhookHttpRouteHandler(
      commandBus as never,
      runIntentService as never,
      webhookItemMapper as never,
    );
    const req = new Request("http://localhost/api/webhooks/my-hook");
    const res = await handler.postWebhook(req, { endpointPath: "my-hook" });
    expect(res.status).toBe(500);
  });
});
