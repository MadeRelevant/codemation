/**
 * Unit tests for LocalInboxChannel (Story 06).
 *
 * Coverage:
 * 1. deliver() returns { kind: "local", inboxItemId: task.taskId }.
 * 2. deliver() logs a message containing taskId and title.
 * 3. kind property is "local".
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { InboxDeliverArgs } from "@codemation/core";
import { LocalInboxChannel } from "../../src/hitl/LocalInboxChannel";
import type { Logger } from "../../src/application/logging/Logger";
import type { ServerLoggerFactory } from "../../src/infrastructure/logging/ServerLoggerFactory";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

class CapturingLogger implements Logger {
  readonly infos: string[] = [];
  info(message: string): void {
    this.infos.push(message);
  }
  warn(): void {}
  error(): void {}
  debug(): void {}
}

class StubLoggerFactory {
  readonly logger = new CapturingLogger();
  create(): Logger {
    return this.logger;
  }
}

function makeChannel(): { channel: LocalInboxChannel; logger: CapturingLogger } {
  const factory = new StubLoggerFactory();
  const channel = new LocalInboxChannel(factory as unknown as ServerLoggerFactory);
  return { channel, logger: factory.logger };
}

function makeDeliverArgs(taskId = "task-abc-123"): InboxDeliverArgs {
  return {
    task: {
      taskId,
      runId: "run-1",
      nodeId: "node-approval",
      expiresAt: new Date("2099-01-01T12:00:00.000Z"),
      resumeUrl: "http://localhost:3000/api/hitl/resume/token123",
    },
    subject: {
      title: "Review payout",
      summary: "Please review the payment request.",
    },
    priority: "normal",
    item: { json: { amount: 100 } },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocalInboxChannel", () => {
  test("kind is 'local'", () => {
    const { channel } = makeChannel();
    assert.equal(channel.kind, "local");
  });

  test("deliver returns inboxItemId equal to task.taskId", async () => {
    const { channel } = makeChannel();
    const args = makeDeliverArgs("task-xyz");

    const delivery = await channel.deliver(args);

    assert.deepEqual(delivery, { kind: "local", inboxItemId: "task-xyz" });
  });

  test("deliver logs a message containing taskId and title", async () => {
    const { channel, logger } = makeChannel();
    const args = makeDeliverArgs("task-log-check");

    await channel.deliver(args);

    assert.ok(logger.infos.length > 0, "should have logged at least one info message");
    const logMessage = logger.infos[0] ?? "";
    assert.ok(logMessage.includes("task-log-check"), `expected taskId in log: "${logMessage}"`);
    assert.ok(logMessage.includes("Review payout"), `expected title in log: "${logMessage}"`);
  });

  test("deliver logs the resumeUrl so devs can use it directly", async () => {
    const { channel, logger } = makeChannel();
    const args = makeDeliverArgs("task-resume-url");

    await channel.deliver(args);

    const logMessage = logger.infos[0] ?? "";
    assert.ok(
      logMessage.includes("http://localhost:3000/api/hitl/resume/token123"),
      `expected resumeUrl in log: "${logMessage}"`,
    );
  });
});
