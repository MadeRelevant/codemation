import assert from "node:assert/strict";
import { test } from "vitest";
import { GoogleGmailApiClientFactory } from "../src/adapters/google/GoogleGmailApiClientFactory";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import type { GmailApiClient, GmailMessageAttachmentContent, GmailMessageRecord } from "../src/services/GmailApiClient";
import { GmailModifyLabelsService } from "../src/services/GmailModifyLabelsService";
import { GmailReplyToMessageService } from "../src/services/GmailReplyToMessageService";
import { GmailSendMessageService } from "../src/services/GmailSendMessageService";

class FakeGmailApiClient implements GmailApiClient {
  readonly sendRequests: unknown[] = [];
  readonly replyRequests: unknown[] = [];
  readonly messageLabelRequests: unknown[] = [];
  readonly threadLabelRequests: unknown[] = [];

  async getCurrentHistoryId(): Promise<string> {
    return "history_1";
  }

  async listMessageIds(): Promise<ReadonlyArray<string>> {
    return [];
  }

  async listLabels(): Promise<ReadonlyArray<{ id: string; name: string; type?: string }>> {
    return [
      { id: "INBOX", name: "Inbox" },
      { id: "Label_done", name: "Done" },
      { id: "Label_follow_up", name: "Follow up" },
    ];
  }

  async getMessage(): Promise<GmailMessageRecord> {
    return {
      messageId: "message_1",
      labelIds: ["INBOX"],
      headers: {},
      attachments: [],
    };
  }

  async getAttachmentContent(): Promise<GmailMessageAttachmentContent> {
    return {
      attachmentId: "attachment_1",
      body: new Uint8Array(),
      mimeType: "application/octet-stream",
    };
  }

  async sendMessage(args: unknown): Promise<GmailMessageRecord> {
    this.sendRequests.push(args);
    return {
      messageId: "sent_1",
      threadId: "thread_sent",
      labelIds: ["SENT"],
      headers: {},
      attachments: [],
    };
  }

  async sendRawMessage(): Promise<GmailMessageRecord> {
    throw new Error("not used in test");
  }

  async replyToMessage(args: unknown): Promise<GmailMessageRecord> {
    this.replyRequests.push(args);
    return {
      messageId: "reply_1",
      threadId: "thread_1",
      labelIds: ["SENT"],
      headers: {},
      attachments: [],
    };
  }

  async modifyMessageLabels(args: unknown): Promise<GmailMessageRecord> {
    this.messageLabelRequests.push(args);
    return {
      messageId: "message_1",
      labelIds: ["Label_done"],
      headers: {},
      attachments: [],
    };
  }

  async modifyThreadLabels(args: unknown): Promise<void> {
    this.threadLabelRequests.push(args);
  }
}

class FakeGoogleGmailApiClientFactory {
  constructor(private readonly client: GmailApiClient) {}

  create(): GmailApiClient {
    return this.client;
  }
}

class GmailActionServicesFixture {
  static createExecutionContext(): {
    getCredential<TSession = unknown>(slotKey: string): Promise<TSession>;
  } {
    return {
      async getCredential<TSession = unknown>(slotKey: string): Promise<TSession> {
        assert.equal(slotKey, "auth");
        return {
          userId: "me",
          emailAddress: "ops@example.com",
        } as TSession;
      },
    };
  }

  static asRecord(value: unknown): Record<string, unknown> {
    return value as Record<string, unknown>;
  }
}

test("GmailSendMessageService normalizes recipients, headers, and attachments", async () => {
  const client = new FakeGmailApiClient();
  const service = new GmailSendMessageService(
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
  );
  const result = await service.send({
    ...GmailActionServicesFixture.createExecutionContext(),
    config: {
      cfg: {
        to: "buyer@example.com, teammate@example.com",
        subject: "Quote response",
        text: "Thanks for the RFQ.",
        cc: ["sales@example.com"],
        headers: {
          "X-Test": " yes ",
        },
        attachments: [
          {
            filename: "quote.txt",
            mimeType: "text/plain",
            body: "hello",
          },
        ],
      },
    },
  } as never);
  assert.equal(result.messageId, "sent_1");
  assert.equal(client.sendRequests.length, 1);
  const request = GmailActionServicesFixture.asRecord(client.sendRequests[0]);
  assert.deepEqual(request["to"], ["buyer@example.com", "teammate@example.com"]);
  assert.deepEqual(request["cc"], ["sales@example.com"]);
  assert.deepEqual(request["headers"], { "X-Test": "yes" });
  assert.equal(Array.isArray(request["attachments"]), true);
});

test("GmailReplyToMessageService validates messageId and forwards reply fields", async () => {
  const client = new FakeGmailApiClient();
  const service = new GmailReplyToMessageService(
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
  );
  const result = await service.reply({
    ...GmailActionServicesFixture.createExecutionContext(),
    config: {
      cfg: {
        messageId: "original_1",
        text: "We will review this.",
        replyToSenderOnly: true,
        subject: "Re: Quote request",
      },
    },
  } as never);
  assert.equal(result.messageId, "reply_1");
  assert.equal(client.replyRequests.length, 1);
  const request = GmailActionServicesFixture.asRecord(client.replyRequests[0]);
  assert.equal(request["messageId"], "original_1");
  assert.equal(request["replyToSenderOnly"], true);
  assert.equal(request["subject"], "Re: Quote request");
});

test("GmailModifyLabelsService resolves label names for message mutations", async () => {
  const client = new FakeGmailApiClient();
  const service = new GmailModifyLabelsService(
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
    new GmailConfiguredLabelService(),
  );
  const result = await service.modify({
    ...GmailActionServicesFixture.createExecutionContext(),
    config: {
      target: "message",
      cfg: {
        messageId: "message_1",
        addLabelIds: "INBOX",
        addLabels: ["Done"],
        removeLabels: "Follow up",
      },
    },
  } as never);
  assert.equal("messageId" in result ? result.messageId : undefined, "message_1");
  assert.equal(client.messageLabelRequests.length, 1);
  const request = GmailActionServicesFixture.asRecord(client.messageLabelRequests[0]);
  assert.deepEqual(request["addLabelIds"], ["INBOX", "Label_done"]);
  assert.deepEqual(request["removeLabelIds"], ["Label_follow_up"]);
});

test("GmailModifyLabelsService returns thread mutation metadata for thread targets", async () => {
  const client = new FakeGmailApiClient();
  const service = new GmailModifyLabelsService(
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
    new GmailConfiguredLabelService(),
  );
  const result = await service.modify({
    ...GmailActionServicesFixture.createExecutionContext(),
    config: {
      target: "thread",
      cfg: {
        threadId: "thread_1",
        addLabels: ["Done"],
      },
    },
  } as never);
  assert.deepEqual(result, {
    target: "thread",
    threadId: "thread_1",
    addLabelIds: ["Label_done"],
    removeLabelIds: [],
  });
  assert.equal(client.threadLabelRequests.length, 1);
});
