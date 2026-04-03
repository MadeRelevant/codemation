import assert from "node:assert/strict";
import type { NodeExecutionContext } from "@codemation/core";
import { test } from "vitest";
import type { GmailLogger } from "../src/contracts/GmailLogger";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import { OnNewGmailTriggerNode } from "../src/nodes/OnNewGmailTriggerNode";
import type { GmailApiClient, GmailMessageAttachmentContent, GmailMessageRecord } from "../src/services/GmailApiClient";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";
import { GmailTriggerAttachmentService } from "../src/services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../src/services/GmailTriggerTestItemService";

class FakeGmailApiClient implements GmailApiClient {
  readonly labels = [{ id: "IMPORTANT", name: "IMPORTANT" }] as const;

  readonly messagesById: Readonly<Record<string, GmailMessageRecord>> = {
    message_1: {
      messageId: "message_1",
      labelIds: ["IMPORTANT"],
      headers: {
        Subject: "Quote request",
        From: "buyer@example.com",
      },
      snippet: "Need a quote",
      textPlain: "Need a quote for widgets.",
      attachments: [],
    },
  };

  async getCurrentHistoryId(_args: Readonly<{ mailbox: string }>): Promise<string> {
    return "history_1";
  }

  async listMessageIds(
    _args: Readonly<{ mailbox: string; labelIds?: ReadonlyArray<string>; query?: string; maxResults?: number }>,
  ): Promise<ReadonlyArray<string>> {
    return ["message_1"];
  }

  async listLabels(_args: Readonly<{ mailbox: string }>) {
    return this.labels;
  }

  async getMessage(args: Readonly<{ mailbox: string; messageId: string }>): Promise<GmailMessageRecord> {
    const message = this.messagesById[args.messageId];
    if (!message) {
      throw new Error(`unknown message ${args.messageId}`);
    }
    return message;
  }

  async getAttachmentContent(
    _args: Readonly<{ mailbox: string; messageId: string; attachment: never }>,
  ): Promise<GmailMessageAttachmentContent> {
    return {
      attachmentId: "attachment_1",
      body: new Uint8Array(),
      mimeType: "text/plain",
      filename: "note.txt",
      size: 0,
    };
  }
}

class FakeGmailLogger implements GmailLogger {
  readonly warnings: string[] = [];

  info(_message: string, _exception?: Error): void {}

  warn(message: string, _exception?: Error): void {
    this.warnings.push(message);
  }

  error(_message: string, _exception?: Error): void {}

  debug(_message: string, _exception?: Error): void {}
}

class OnNewGmailTriggerNodeTestFixture {
  static createConfig(): OnNewGmailTrigger {
    return new OnNewGmailTrigger(
      "On Gmail",
      {
        mailbox: "sales@example.com",
        labelIds: ["IMPORTANT"],
        query: "quote",
      },
      "gmail_trigger",
    );
  }

  static createTestItemService(): GmailTriggerTestItemService {
    return new GmailTriggerTestItemService(
      new GmailConfiguredLabelService(),
      new GmailMessageItemMapper(),
      new GmailQueryMatcher(),
    );
  }

  static createNode(logger: GmailLogger): OnNewGmailTriggerNode {
    return new OnNewGmailTriggerNode(
      {} as never,
      new GmailTriggerAttachmentService(),
      this.createTestItemService(),
      logger,
    );
  }
}

test("GmailTriggerTestItemService creates a preview item from the latest matching message", async () => {
  const service = OnNewGmailTriggerNodeTestFixture.createTestItemService();
  const client = new FakeGmailApiClient();
  const items = await service.createItems({
    trigger: { workflowId: "wf.gmail", nodeId: "gmail_trigger" },
    client,
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
    previousState: undefined,
  });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0]?.json.mailbox, "sales@example.com");
  assert.deepEqual(items[0]?.json.historyId, "history_1");
  assert.deepEqual(items[0]?.json.messageId, "message_1");
  assert.deepEqual(items[0]?.json.subject, "Quote request");
  assert.deepEqual(items[0]?.json.from, "buyer@example.com");
  assert.deepEqual(items[0]?.json.snippet, "Need a quote");
  assert.deepEqual(items[0]?.json.textPlain, "Need a quote for widgets.");
  assert.deepEqual(items[0]?.json.attachments, []);
});

test("OnNewGmailTriggerNode.execute rejects manual execution without Gmail items", async () => {
  const logger = new FakeGmailLogger();
  const node = OnNewGmailTriggerNodeTestFixture.createNode(logger);
  const ctx = {
    workflowId: "wf.gmail",
    nodeId: "gmail_trigger",
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
  } as NodeExecutionContext<OnNewGmailTrigger>;

  await assert.rejects(async () => {
    await node.execute([], ctx);
  }, /cannot be run manually without a pulled Gmail event/);
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0] ?? "", /manual execution attempted/);
});
