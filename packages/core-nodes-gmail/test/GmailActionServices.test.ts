import assert from "node:assert/strict";
import type { ReadableStream as BinaryReadableStream } from "node:stream/web";
import { ReadableStream } from "node:stream/web";
import type { BinaryAttachment, Item } from "@codemation/core";
import { test } from "vitest";
import { GoogleGmailApiClientFactory } from "../src/adapters/google/GoogleGmailApiClientFactory";
import { modifyGmailLabelsInputSchema } from "../src/nodes/ModifyGmailLabels";
import { replyToGmailMessageInputSchema } from "../src/nodes/ReplyToGmailMessage";
import { sendGmailMessageInputSchema } from "../src/nodes/SendGmailMessage";
import { BinaryStreamCollector } from "../src/services/BinaryStreamCollector";
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
  static createSendService(client: GmailApiClient): GmailSendMessageService {
    return new GmailSendMessageService(
      new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
      new BinaryStreamCollector(),
    );
  }

  static createReplyService(client: GmailApiClient): GmailReplyToMessageService {
    return new GmailReplyToMessageService(
      new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
      new BinaryStreamCollector(),
    );
  }

  static createModifyLabelsService(client: GmailApiClient): GmailModifyLabelsService {
    return new GmailModifyLabelsService(
      new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
      new GmailConfiguredLabelService(),
    );
  }

  static createExecutionContext(binaryByStorageKey: Readonly<Record<string, Uint8Array>> = {}) {
    return {
      async getCredential<TSession = unknown>(slotKey: string): Promise<TSession> {
        assert.equal(slotKey, "auth");
        return {
          userId: "me",
          emailAddress: "ops@example.com",
        } as TSession;
      },
      binary: {
        async openReadStream(attachment: BinaryAttachment) {
          const bytes = binaryByStorageKey[attachment.storageKey];
          if (!bytes) {
            return undefined;
          }
          return {
            body: GmailActionServicesFixture.readableStreamFrom(bytes),
            size: bytes.byteLength,
          };
        },
      },
    } as never;
  }

  static itemWithBinary<TJson>(json: TJson, binaryName: string, bytes: Uint8Array): Item<TJson> {
    return {
      json,
      binary: {
        [binaryName]: this.binaryAttachment({
          name: binaryName,
          storageKey: `storage/${binaryName}`,
          mimeType: "application/pdf",
          filename: `${binaryName}.pdf`,
          size: bytes.byteLength,
        }),
      },
    };
  }

  static binaryAttachment(
    args: Readonly<{ name: string; storageKey: string; mimeType: string; filename: string; size: number }>,
  ): BinaryAttachment {
    return {
      id: `att_${args.name}`,
      storageKey: args.storageKey,
      mimeType: args.mimeType,
      size: args.size,
      storageDriver: "memory",
      previewKind: "download",
      createdAt: "2026-05-01T00:00:00.000Z",
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "activation_1",
      filename: args.filename,
    };
  }

  static asRecord(value: unknown): Record<string, unknown> {
    return value as Record<string, unknown>;
  }

  private static readableStreamFrom(bytes: Uint8Array): BinaryReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }
}

test("GmailSendMessageService normalizes recipients, headers, and binary attachments", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createSendService(client);
  const bytes = new Uint8Array([1, 2, 3]);
  const input = sendGmailMessageInputSchema.parse({
    to: "buyer@example.com, teammate@example.com",
    subject: "Quote response",
    text: "Thanks for the RFQ.",
    cc: ["sales@example.com"],
    headers: {
      "X-Test": " yes ",
    },
    attachments: [
      {
        binaryName: "quote",
        filename: "custom.pdf",
      },
    ],
  });
  const result = await service.send({
    input,
    item: GmailActionServicesFixture.itemWithBinary(input, "quote", bytes),
    ctx: GmailActionServicesFixture.createExecutionContext({ "storage/quote": bytes }),
  });
  assert.equal(result.messageId, "sent_1");
  assert.equal(client.sendRequests.length, 1);
  const request = GmailActionServicesFixture.asRecord(client.sendRequests[0]);
  assert.deepEqual(request["to"], ["buyer@example.com", "teammate@example.com"]);
  assert.deepEqual(request["cc"], ["sales@example.com"]);
  assert.deepEqual(request["headers"], { "X-Test": "yes" });
  const attachments = request["attachments"] as ReadonlyArray<Record<string, unknown>>;
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.["filename"], "custom.pdf");
  assert.equal(attachments[0]?.["mimeType"], "application/pdf");
  assert.deepEqual(Array.from(attachments[0]?.["body"] as Uint8Array), [1, 2, 3]);
});

test("GmailSendMessageService forwards optional envelope fields and attachment metadata", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createSendService(client);
  const bytes = new Uint8Array([9]);
  const input = sendGmailMessageInputSchema.parse({
    to: ["one@b.com", "two@b.com"],
    subject: "Subj",
    text: "Hi",
    bcc: "bcc@b.com",
    replyTo: "reply@b.com",
    from: "from@b.com",
    attachments: [
      {
        binaryName: "quote",
        contentId: " cid ",
        contentTransferEncoding: "8bit",
        disposition: "inline",
      },
    ],
  });
  await service.send({
    input,
    item: GmailActionServicesFixture.itemWithBinary(input, "quote", bytes),
    ctx: GmailActionServicesFixture.createExecutionContext({ "storage/quote": bytes }),
  });
  assert.equal(client.sendRequests.length, 1);
  const request = GmailActionServicesFixture.asRecord(client.sendRequests[0]);
  assert.deepEqual(request["to"], ["one@b.com", "two@b.com"]);
  assert.deepEqual(request["bcc"], ["bcc@b.com"]);
  assert.equal(request["replyTo"], "reply@b.com");
  assert.equal(request["from"], "from@b.com");
  const attachments = request["attachments"] as ReadonlyArray<Record<string, unknown>>;
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.["contentId"], "cid");
  assert.equal(attachments[0]?.["contentTransferEncoding"], "8bit");
  assert.equal(attachments[0]?.["disposition"], "inline");
  assert.deepEqual(Array.from(attachments[0]?.["body"] as Uint8Array), [9]);
});

test("GmailSendMessageService rejects attachment references missing from item.binary", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createSendService(client);
  const input = sendGmailMessageInputSchema.parse({
    to: "buyer@example.com",
    subject: "Quote response",
    attachments: [{ binaryName: "missing" }],
  });
  await assert.rejects(
    () =>
      service.send({
        input,
        item: { json: input },
        ctx: GmailActionServicesFixture.createExecutionContext(),
      }),
    /attachments\[0\]\.binaryName "missing" was not found/,
  );
  assert.equal(client.sendRequests.length, 0);
});

test("GmailReplyToMessageService forwards reply fields and binary attachments", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createReplyService(client);
  const bytes = new Uint8Array([4, 5, 6]);
  const input = replyToGmailMessageInputSchema.parse({
    messageId: "original_1",
    html: "<p>We will review this.</p>",
    replyToSenderOnly: true,
    subject: "Re: Quote request",
    headers: { " ": "no", Valid: "yes", Drop: "" },
    attachments: [{ binaryName: "quote", disposition: "attachment" }],
  });
  const result = await service.reply({
    input,
    item: GmailActionServicesFixture.itemWithBinary(input, "quote", bytes),
    ctx: GmailActionServicesFixture.createExecutionContext({ "storage/quote": bytes }),
  });
  assert.equal(result.messageId, "reply_1");
  assert.equal(client.replyRequests.length, 1);
  const request = GmailActionServicesFixture.asRecord(client.replyRequests[0]);
  assert.equal(request["messageId"], "original_1");
  assert.equal(request["replyToSenderOnly"], true);
  assert.equal(request["subject"], "Re: Quote request");
  assert.deepEqual(request["headers"], { Valid: "yes" });
  const attachments = request["attachments"] as ReadonlyArray<Record<string, unknown>>;
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.["filename"], "quote.pdf");
  assert.deepEqual(Array.from(attachments[0]?.["body"] as Uint8Array), [4, 5, 6]);
});

test("GmailReplyToMessageService rejects binary references that cannot be opened", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createReplyService(client);
  const bytes = new Uint8Array([1]);
  const input = replyToGmailMessageInputSchema.parse({
    messageId: "original_1",
    text: "Thanks",
    attachments: [{ binaryName: "quote" }],
  });
  await assert.rejects(
    () =>
      service.reply({
        input,
        item: GmailActionServicesFixture.itemWithBinary(input, "quote", bytes),
        ctx: GmailActionServicesFixture.createExecutionContext(),
      }),
    /attachments\[0\]\.binaryName "quote" could not be opened/,
  );
  assert.equal(client.replyRequests.length, 0);
});

test("GmailModifyLabelsService resolves label names for message mutations", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createModifyLabelsService(client);
  const input = modifyGmailLabelsInputSchema.parse({
    messageId: "message_1",
    addLabelIds: "INBOX",
    addLabels: ["Done"],
    removeLabels: "Follow up",
  });
  const result = await service.modify({
    input,
    ctx: GmailActionServicesFixture.createExecutionContext(),
  });
  assert.equal("messageId" in result ? result.messageId : undefined, "message_1");
  assert.equal(client.messageLabelRequests.length, 1);
  const request = GmailActionServicesFixture.asRecord(client.messageLabelRequests[0]);
  assert.deepEqual(request["addLabelIds"], ["INBOX", "Label_done"]);
  assert.deepEqual(request["removeLabelIds"], ["Label_follow_up"]);
});

test("GmailModifyLabelsService returns thread mutation metadata for thread targets", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createModifyLabelsService(client);
  const input = modifyGmailLabelsInputSchema.parse({
    target: "thread",
    threadId: "thread_1",
    addLabels: ["Done"],
  });
  const result = await service.modify({
    input,
    ctx: GmailActionServicesFixture.createExecutionContext(),
  });
  assert.deepEqual(result, {
    target: "thread",
    threadId: "thread_1",
    addLabelIds: ["Label_done"],
    removeLabelIds: [],
  });
  assert.equal(client.threadLabelRequests.length, 1);
});

test("GmailModifyLabelsService throws when no label operations are provided", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createModifyLabelsService(client);
  const input = modifyGmailLabelsInputSchema.parse({
    messageId: "message_1",
  });
  await assert.rejects(
    () =>
      service.modify({
        input,
        ctx: GmailActionServicesFixture.createExecutionContext(),
      }),
    /at least one label/,
  );
});

test("GmailModifyLabelsService rejects empty threadId for thread targets", async () => {
  const client = new FakeGmailApiClient();
  const service = GmailActionServicesFixture.createModifyLabelsService(client);
  const input = modifyGmailLabelsInputSchema.parse({
    target: "thread",
    threadId: "  ",
    addLabels: ["Done"],
  });
  await assert.rejects(
    () =>
      service.modify({
        input,
        ctx: GmailActionServicesFixture.createExecutionContext(),
      }),
    /input.threadId/,
  );
});
