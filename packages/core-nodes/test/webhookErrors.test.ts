import { describe, expect, it } from "vitest";
import { WebhookRespondNowAndContinueError } from "../src/nodes/webhookRespondNowAndContinueError";
import { WebhookRespondNowError } from "../src/nodes/webhookRespondNowError";

describe("WebhookRespondNowError", () => {
  it("constructs with responseItems", () => {
    const items = [{ json: { status: "ok" } }];
    const err = new WebhookRespondNowError(items);
    expect(err.responseItems).toBe(items);
    expect(err.kind).toBe("respondNow");
    expect(err.__webhookControl).toBe(true);
    expect(err.name).toBe("WebhookRespondNowError");
    expect(err).toBeInstanceOf(Error);
  });

  it("uses default message when none provided", () => {
    const err = new WebhookRespondNowError([]);
    expect(err.message).toBe("Webhook responded immediately.");
  });

  it("accepts custom message", () => {
    const err = new WebhookRespondNowError([], "custom msg");
    expect(err.message).toBe("custom msg");
  });
});

describe("WebhookRespondNowAndContinueError", () => {
  it("constructs with responseItems and continueItems", () => {
    const responseItems = [{ json: { status: "ok" } }];
    const continueItems = [{ json: { next: true } }];
    const err = new WebhookRespondNowAndContinueError(responseItems, continueItems);
    expect(err.responseItems).toBe(responseItems);
    expect(err.continueItems).toBe(continueItems);
    expect(err.kind).toBe("respondNowAndContinue");
    expect(err.__webhookControl).toBe(true);
    expect(err.name).toBe("WebhookRespondNowAndContinueError");
    expect(err).toBeInstanceOf(Error);
  });

  it("uses default message when none provided", () => {
    const err = new WebhookRespondNowAndContinueError([], []);
    expect(err.message).toBe("Webhook responded immediately and continued the run.");
  });

  it("accepts custom message", () => {
    const err = new WebhookRespondNowAndContinueError([], [], "custom");
    expect(err.message).toBe("custom");
  });
});
