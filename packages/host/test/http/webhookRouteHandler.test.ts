// @vitest-environment node

import type { WebhookInvocationMatch, WebhookTriggerResolution, WorkflowDefinition } from "@codemation/core";
import { InMemoryBinaryStorage } from "@codemation/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../../src/application/bus/Command";
import type { CommandBus } from "../../src/application/bus/CommandBus";
import { HandleWebhookInvocationCommandHandler } from "../../src/application/commands/HandleWebhookInvocationCommandHandler";
import { RequestToWebhookItemMapper } from "../../src/infrastructure/webhooks/RequestToWebhookItemMapper";
import { WebhookHttpRouteHandler } from "../../src/presentation/http/routeHandlers/WebhookHttpRouteHandler";

class WebhookRouteHandlerTestIdFactory {
  makeRunId(): string {
    return "run_webhook_test";
  }

  makeActivationId(): string {
    return "act_webhook_test";
  }
}

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

function resolveWebhookFromEntry(
  entry:
    | Readonly<{
        endpointPath: string;
        workflowId: string;
        nodeId: string;
        methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
        parseJsonBody?: (body: unknown) => unknown;
      }>
    | undefined,
  endpointPath: string,
  method: string,
): WebhookTriggerResolution {
  if (!entry || entry.endpointPath !== endpointPath) {
    return { status: "notFound" };
  }
  const match: WebhookInvocationMatch = {
    endpointPath: entry.endpointPath,
    workflowId: entry.workflowId,
    nodeId: entry.nodeId,
    methods: [...entry.methods],
    parseJsonBody: entry.parseJsonBody,
  };
  if (!entry.methods.includes(method as never)) {
    return { status: "methodNotAllowed", match };
  }
  return { status: "ok", match };
}

class FrontendWebhookRuntimeFixture {
  static create(
    args?: Readonly<{
      entry?: Readonly<{
        endpointPath: string;
        workflowId: string;
        nodeId: string;
        methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
        parseJsonBody?: (body: unknown) => unknown;
      }>;
      responseItems?: ReadonlyArray<Readonly<{ json: unknown }>>;
    }>,
  ) {
    const runWebhookMatch = vi
      .fn()
      .mockImplementation(
        async ({ match, requestItem }: { match: WebhookInvocationMatch; requestItem: { json?: unknown } }) => {
          const entry = args?.entry;
          if (!entry || entry.endpointPath !== match.endpointPath) {
            throw new Error("Unknown webhook endpoint");
          }
          return {
            runId: "run_webhook_route",
            workflowId: FrontendWebhookWorkflowFixture.createWorkflow().id,
            startedAt: "2026-03-11T12:00:00.000Z",
            runStatus: "completed" as const,
            response: [{ json: requestItem.json }, ...(args?.responseItems ?? [{ json: { ok: true } }])],
          };
        },
      );
    const workflow = FrontendWebhookWorkflowFixture.createWorkflow();
    return {
      workflow,
      runWebhookMatch,
      preparedExecutionRuntime: {
        runIntentService: {
          resolveWebhookTrigger: vi
            .fn()
            .mockImplementation(({ endpointPath, method }: { endpointPath: string; method: string }) =>
              resolveWebhookFromEntry(args?.entry, endpointPath, method),
            ),
          runWebhookMatch,
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
    const ids = new WebhookRouteHandlerTestIdFactory();
    return new WebhookHttpRouteHandler(
      commandBus,
      runtime.runIntentService as never,
      new RequestToWebhookItemMapper(new InMemoryBinaryStorage(), ids, ids),
    );
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
      { endpointPath: "missing" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown webhook endpoint" });
  });

  it("returns 405 when the request method is not supported by the registered webhook", async () => {
    const runtime = FrontendWebhookRuntimeFixture.create({
      entry: {
        endpointPath: "incoming",
        workflowId: "wf.webhook.route",
        nodeId: "trigger",
        methods: ["POST"],
      },
    });
    const handler = FrontendWebhookRouteHandlerFixture.createHandler(runtime.preparedExecutionRuntime);

    const response = await handler.postWebhook(
      new Request("http://localhost/api/webhooks/incoming", { method: "GET" }),
      { endpointPath: "incoming" },
    );

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: "Method not allowed" });
  });

  it("maps JSON request data, applies the registered parser, and returns the last output item json", async () => {
    const entry = {
      endpointPath: "incoming",
      workflowId: "wf.webhook.route",
      nodeId: "trigger",
      methods: ["PATCH", "POST"] as const,
      parseJsonBody(body: unknown): unknown {
        const source = body as Readonly<{ count: string; name: string }>;
        return {
          name: source.name.trim(),
          count: Number(source.count),
        };
      },
    };
    const runtime = FrontendWebhookRuntimeFixture.create({
      entry,
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
      { endpointPath: "incoming" },
    );

    const expectedMatch = resolveWebhookFromEntry(entry, "incoming", "PATCH");
    expect(expectedMatch.status).toBe("ok");
    if (expectedMatch.status !== "ok") {
      throw new Error("expected ok match");
    }
    expect(runtime.runWebhookMatch).toHaveBeenCalledWith({
      match: expectedMatch.match,
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
    const entry = {
      endpointPath: "plain-text",
      workflowId: "wf.webhook.route",
      nodeId: "trigger",
      methods: ["PUT"] as const,
    };
    const runtime = FrontendWebhookRuntimeFixture.create({
      entry,
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
      { endpointPath: "plain-text" },
    );

    const expectedMatch = resolveWebhookFromEntry(entry, "plain-text", "PUT");
    expect(expectedMatch.status).toBe("ok");
    if (expectedMatch.status !== "ok") {
      throw new Error("expected ok match");
    }
    expect(runtime.runWebhookMatch).toHaveBeenCalledWith({
      match: expectedMatch.match,
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
