/**
 * Tests for GmailPollingService.runCycle — gmail-specific baseline-skip, dedup integration, and
 * message-fetch+filter ordering. The generic loop/overlap-guard/persistence behavior moved to
 * packages/core/test/PollingTriggerRuntime.test.ts.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { PollingTriggerDedupWindow } from "@codemation/core";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import type { GmailApiClient, GmailMessageAttachmentContent, GmailMessageRecord } from "../src/services/GmailApiClient";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import { GmailPollingService } from "../src/services/GmailPollingService";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";

class FakeGmailApiClient implements GmailApiClient {
  labels = [
    { id: "IMPORTANT", name: "IMPORTANT" },
    { id: "Label_demo", name: "Demo" },
  ] as const;

  listCallCount = 0;

  readonly messagesById: Readonly<Record<string, GmailMessageRecord>> = {
    m1: {
      messageId: "m1",
      labelIds: ["IMPORTANT"],
      headers: { Subject: "Old", From: "a@example.com" },
      snippet: "old",
      attachments: [],
    },
    m2: {
      messageId: "m2",
      labelIds: ["IMPORTANT"],
      headers: { Subject: "Quote request", From: "buyer@example.com" },
      snippet: "Need a quote",
      textPlain: "Please send a quote for the attached scope.",
      attachments: [],
    },
  };

  async getCurrentHistoryId(): Promise<string> {
    return "history_profile";
  }

  async listMessageIds(): Promise<ReadonlyArray<string>> {
    this.listCallCount += 1;
    if (this.listCallCount === 1) {
      return ["m1"];
    }
    return ["m2", "m1"];
  }

  async listLabels() {
    return this.labels;
  }

  async getMessage(args: Readonly<{ messageId: string }>): Promise<GmailMessageRecord> {
    const message = this.messagesById[args.messageId];
    if (!message) {
      throw new Error(`unknown message ${args.messageId}`);
    }
    return message;
  }

  async getAttachmentContent(): Promise<GmailMessageAttachmentContent> {
    return {
      attachmentId: "a1",
      body: new Uint8Array(),
      mimeType: "text/plain",
      filename: "x.txt",
      size: 0,
    };
  }

  async sendMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async sendRawMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async replyToMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async modifyMessageLabels(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async modifyThreadLabels(): Promise<void> {}
}

function createConfig(
  overrides: Partial<{
    mailbox: string;
    labelIds: ReadonlyArray<string>;
    query: string;
  }> = {},
): OnNewGmailTrigger {
  return new OnNewGmailTrigger(
    "On Gmail",
    {
      mailbox: overrides.mailbox ?? "sales@example.com",
      labelIds: overrides.labelIds ?? ["IMPORTANT"],
      query: overrides.query ?? "quote",
    },
    "gmail_trigger",
  );
}

function createPollingService(): GmailPollingService {
  return new GmailPollingService(
    new PollingTriggerDedupWindow(),
    new GmailConfiguredLabelService(),
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );
}

test("GmailPollingService.runCycle baselines on first call (no previousState) then returns items on second", async () => {
  const service = createPollingService();
  const client = new FakeGmailApiClient();
  const config = createConfig();
  const maxMessagesPerPoll = 20;

  // First call with no prior state → baseline, no items
  const first = await service.runCycle({ previousState: undefined, client, config, maxMessagesPerPoll });
  assert.equal(first.items.length, 0);
  assert.equal(first.nextState.baselineComplete, true);
  assert.deepEqual(first.nextState.processedMessageIds, ["m1"]);

  // Second call with the state from the first → m2 is new, m1 is deduped
  const second = await service.runCycle({ previousState: first.nextState, client, config, maxMessagesPerPoll });
  assert.equal(second.items.length, 1);
  assert.equal((second.items[0]?.json as { messageId: string }).messageId, "m2");
  assert.ok(second.nextState.processedMessageIds.includes("m2"));
  assert.ok(second.nextState.processedMessageIds.includes("m1"));
});

test("GmailPollingService.runCycle applies Gmail search syntax query filter", async () => {
  const service = createPollingService();
  const client = new FakeGmailApiClient();
  const config = createConfig({
    query: "from:buyer@example.com has:attachment newer_than:7d",
  });
  const maxMessagesPerPoll = 20;

  // Baseline pass
  const first = await service.runCycle({ previousState: undefined, client, config, maxMessagesPerPoll });
  assert.equal(first.items.length, 0);

  // Second pass picks up m2 which matches the from: buyer@example.com query
  const second = await service.runCycle({ previousState: first.nextState, client, config, maxMessagesPerPoll });
  assert.equal(second.items.length, 1);
  assert.equal((second.items[0]?.json as { messageId: string }).messageId, "m2");
});

test("GmailPollingService.runCycle dedup window prevents re-emitting known message ids", async () => {
  const service = createPollingService();
  const client = new FakeGmailApiClient();
  const config = createConfig();
  const maxMessagesPerPoll = 20;

  // Baseline
  const first = await service.runCycle({ previousState: undefined, client, config, maxMessagesPerPoll });
  // Second — emits m2
  const second = await service.runCycle({ previousState: first.nextState, client, config, maxMessagesPerPoll });
  assert.equal(second.items.length, 1);
  // Third — same list, m2 is now deduped
  const third = await service.runCycle({ previousState: second.nextState, client, config, maxMessagesPerPoll });
  assert.equal(third.items.length, 0);
});
