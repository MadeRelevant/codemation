import { describe, expect, it } from "vitest";
import { HandleWebhookInvocationCommand } from "../../../src/application/commands/HandleWebhookInvocationCommand";
import { HandleWebhookInvocationCommandHandler } from "../../../src/application/commands/HandleWebhookInvocationCommandHandler";
import { ApplicationRequestError } from "../../../src/application/ApplicationRequestError";
import type { RunIntentService } from "@codemation/core/bootstrap";

type WebhookTriggerResolution =
  | { status: "notFound" }
  | { status: "methodNotAllowed"; match: unknown }
  | { status: "ok"; match: unknown };

class RunIntentServiceStub {
  constructor(
    private readonly resolution: WebhookTriggerResolution,
    private readonly runResult?: { response: Array<{ json?: unknown }> },
  ) {}

  resolveWebhookTrigger(_args: unknown): WebhookTriggerResolution {
    return this.resolution;
  }

  async runWebhookMatch(_args: unknown): Promise<{ response: Array<{ json?: unknown }> }> {
    return this.runResult ?? { response: [] };
  }
}

function makeHandler(
  resolution: WebhookTriggerResolution,
  runResult?: { response: Array<{ json?: unknown }> },
): HandleWebhookInvocationCommandHandler {
  return new HandleWebhookInvocationCommandHandler(
    new RunIntentServiceStub(resolution, runResult) as unknown as RunIntentService,
  );
}

function makeCommand(
  overrides: Partial<{ requestMethod: string; endpointPath: string; requestItem: unknown }> = {},
): HandleWebhookInvocationCommand {
  return new HandleWebhookInvocationCommand(
    overrides.endpointPath ?? "/webhook/test",
    overrides.requestMethod ?? "POST",
    (overrides.requestItem as never) ?? { json: {} },
  );
}

describe("HandleWebhookInvocationCommandHandler", () => {
  it("throws 404 when webhook endpoint is not found", async () => {
    const handler = makeHandler({ status: "notFound" });
    await expect(handler.execute(makeCommand())).rejects.toThrow(expect.objectContaining({ status: 404 }));
  });

  it("throws 405 when HTTP method is not allowed", async () => {
    const handler = makeHandler({ status: "methodNotAllowed", match: {} });
    await expect(handler.execute(makeCommand())).rejects.toThrow(expect.objectContaining({ status: 405 }));
  });

  it("returns last response item json on success", async () => {
    const handler = makeHandler({ status: "ok", match: {} }, { response: [{ json: { result: "ok" } }] });
    const result = await handler.execute(makeCommand());
    expect(result).toEqual({ result: "ok" });
  });

  it("returns null when response array is empty", async () => {
    const handler = makeHandler({ status: "ok", match: {} }, { response: [] });
    const result = await handler.execute(makeCommand());
    expect(result).toBeNull();
  });

  it("decodes URL-encoded endpointPath", async () => {
    let capturedPath: string | undefined;
    class IntrospectingRunIntentService {
      resolveWebhookTrigger(args: { endpointPath: string; method: string }): WebhookTriggerResolution {
        capturedPath = args.endpointPath;
        return { status: "notFound" };
      }
    }
    const handler = new HandleWebhookInvocationCommandHandler(
      new IntrospectingRunIntentService() as unknown as RunIntentService,
    );
    const command = new HandleWebhookInvocationCommand("/webhook%2Fencoded", "POST", { json: {} });
    await expect(handler.execute(command)).rejects.toThrow();
    expect(capturedPath).toBe("/webhook/encoded");
  });

  it("wraps unexpected errors from runWebhookMatch in ApplicationRequestError 400", async () => {
    class ThrowingRunIntentService {
      resolveWebhookTrigger(): WebhookTriggerResolution {
        return { status: "ok", match: {} };
      }
      async runWebhookMatch(): Promise<never> {
        throw new Error("unexpected-error");
      }
    }
    const handler = new HandleWebhookInvocationCommandHandler(
      new ThrowingRunIntentService() as unknown as RunIntentService,
    );
    await expect(handler.execute(makeCommand())).rejects.toMatchObject({
      status: 400,
      message: "unexpected-error",
    });
  });

  it("re-throws ApplicationRequestError without wrapping", async () => {
    class ThrowingRunIntentService {
      resolveWebhookTrigger(): WebhookTriggerResolution {
        return { status: "ok", match: {} };
      }
      async runWebhookMatch(): Promise<never> {
        throw new ApplicationRequestError(422, "custom-error");
      }
    }
    const handler = new HandleWebhookInvocationCommandHandler(
      new ThrowingRunIntentService() as unknown as RunIntentService,
    );
    await expect(handler.execute(makeCommand())).rejects.toMatchObject({
      status: 422,
      message: "custom-error",
    });
  });
});
