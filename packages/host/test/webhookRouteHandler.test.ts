// @vitest-environment node

import type { WorkflowDefinition } from "@codemation/core";
import { beforeEach,describe,expect,it,vi } from "vitest";
import type { Command } from "../src/application/bus/Command";
import type { CommandBus } from "../src/application/bus/CommandBus";
import { HandleWebhookInvocationCommandHandler } from "../src/application/commands/HandleWebhookInvocationCommandHandler";
import { RequestToWebhookItemMapper } from "../src/infrastructure/webhooks/RequestToWebhookItemMapper";
import { WebhookHttpRouteHandler } from "../src/presentation/http/routeHandlers/WebhookHttpRouteHandler";

class FrontendWebhookWorkflowFixture {
  static createWorkflow(): WorkflowDefinition {
    return {
      id: "wf.webhook.route",
      name: "Webhook route workflow",
      nodes: [],
      edges: [],
    };
  }
}

class FrontendWebhookRuntimeFixture {
  static create(args?: Readonly<{
    entry?: Readonly<{
      endpointId: string;
      workflowId: string;
      nodeId: string;
      methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
      parseJsonBody?: (body: unknown) => unknown;
    }>;
    responseItems?: ReadonlyArray<Readonly<{ json: unknown }>>;
  }>) {
    const runMatchedWebhook = vi.fn().mockResolvedValue({
      runId: "run_webhook_route",
      workflowId: "wf.webhook.route",
      startedAt: "2026-03-11T12:00:00.000Z",
      runStatus: "completed",
      response: args?.responseItems ?? [{ json: { ok: true } }],
    });
    const workflow = FrontendWebhookWorkflowFixture.createWorkflow();
    return {
      workflow,
      runMatchedWebhook,
      preparedExecutionRuntime: {
        runIntentService: {
          findWebhookTrigger: vi.fn().mockImplementation((endpointId: string) => {
            const entry = args?.entry;
            return entry?.endpointId === endpointId ? entry : undefined;
          }),
          matchWebhookTrigger: vi.fn().mockImplementation(({ endpointId, method }: { endpointId: string; method: string }) => {
            const entry = args?.entry;
            if (!entry || entry.endpointId !== endpointId) {
              return undefined;
            }
            return entry.methods.includes(method as never) ? entry : undefined;
          }),
          runWebhookMatch: vi.fn().mockImplementation(async ({ match, requestItem }) => {
            const entry = args?.entry;
            if (!entry || entry.endpointId !== match.endpointId) {
              throw new Error("Unknown webhook endpoint");
            }
            await runMatchedWebhook({ match, requestItem });
            return {
              runId: "run_webhook_route",
              workflowId: workflow.id,
              startedAt: "2026-03-11T12:00:00.000Z",
              runStatus: "completed" as const,
              response: [{ json: requestItem.json }, ...(args?.responseItems ?? [{ json: { ok: true } }])],
            };
          }),
        },
      },
    };
  }
}

class FrontendWebhookRouteHandlerFixture {
  static createHandler(preparedExecutionRuntime: object): WebhookHttpRouteHandler {
    const runtime = preparedExecutionRuntime as Readonly<{
      runIntentService: object;
    }>;
    const commandHandler = new HandleWebhookInvocationCommandHandler(runtime.runIntentService as never);
    const commandBus: CommandBus = {
      execute: async <TResult>(command: Command<TResult>) =>
        (await commandHandler.execute(command as never)) as TResult,
    };
    return new WebhookHttpRouteHandler(commandBus, runtime.runIntentService as never, new RequestToWebhookItemMapper());
  }
}

describe("postWebhookRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when no registered webhook id matches", async () => {
    const runtime = FrontendWebhookRuntimeFixture.create();
    const handler = FrontendWebhookRouteHandlerFixture.createHandler(runtime.preparedExecutionRuntime);

    const response = await handler.postWebhook(
      new Request("http://localhost/api/webhooks/missing", { method: "POST" }),
      { endpointId: "missing" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown webhook endpoint" });
  });

  it("returns 405 when the request method is not supported by the registered webhook", async () => {
    const runtime = FrontendWebhookRuntimeFixture.create({
      entry: {
        endpointId: "incoming",
        workflowId: "wf.webhook.route",
        nodeId: "trigger",
        methods: ["POST"],
      },
    });
    const handler = FrontendWebhookRouteHandlerFixture.createHandler(runtime.preparedExecutionRuntime);

    const response = await handler.postWebhook(
      new Request("http://localhost/api/webhooks/incoming", { method: "GET" }),
      { endpointId: "incoming" },
    );

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: "Method not allowed" });
  });

  it("maps JSON request data, applies the registered parser, and returns the last output item json", async () => {
    const runtime = FrontendWebhookRuntimeFixture.create({
      entry: {
        endpointId: "incoming",
        workflowId: "wf.webhook.route",
        nodeId: "trigger",
        methods: ["PATCH", "POST"],
        parseJsonBody(body: unknown): unknown {
          const source = body as Readonly<{ count: string; name: string }>;
          return {
            name: source.name.trim(),
            count: Number(source.count),
          };
        },
      },
      responseItems: [{ json: { ok: true } }],
    });
    const handler = FrontendWebhookRouteHandlerFixture.createHandler(runtime.preparedExecutionRuntime);

    const response = await handler.postWebhook(
      new Request("http://localhost/api/webhooks/incoming?mode=sync", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-webhook-token": "secret",
        },
        body: JSON.stringify({ count: "2", name: "  Ada  " }),
      }),
      { endpointId: "incoming" },
    );

    expect(runtime.runMatchedWebhook).toHaveBeenCalledWith({
      match: runtime.preparedExecutionRuntime.runIntentService.findWebhookTrigger("incoming"),
      requestItem: {
        json: {
          headers: {
            "content-type": "application/json",
            "x-webhook-token": "secret",
          },
          body: {
            count: "2",
            name: "  Ada  ",
          },
          json: {
            count: 2,
            name: "Ada",
          },
          method: "PATCH",
          url: "http://localhost/api/webhooks/incoming?mode=sync",
          query: {
            mode: "sync",
          },
        },
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("maps non-json request bodies without attempting json parsing", async () => {
    const runtime = FrontendWebhookRuntimeFixture.create({
      entry: {
        endpointId: "plain-text",
        workflowId: "wf.webhook.route",
        nodeId: "trigger",
        methods: ["PUT"],
      },
      responseItems: [{ json: { accepted: true } }],
    });
    const handler = FrontendWebhookRouteHandlerFixture.createHandler(runtime.preparedExecutionRuntime);

    const response = await handler.postWebhook(
      new Request("http://localhost/api/webhooks/plain-text?topic=notes", {
        method: "PUT",
        headers: {
          "content-type": "text/plain",
        },
        body: "hello from webhook",
      }),
      { endpointId: "plain-text" },
    );

    expect(runtime.runMatchedWebhook).toHaveBeenCalledWith({
      match: runtime.preparedExecutionRuntime.runIntentService.findWebhookTrigger("plain-text"),
      requestItem: {
        json: {
          headers: {
            "content-type": "text/plain",
          },
          body: "hello from webhook",
          method: "PUT",
          url: "http://localhost/api/webhooks/plain-text?topic=notes",
          query: {
            topic: "notes",
          },
        },
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });
});
