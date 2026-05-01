import assert from "node:assert/strict";
import { test } from "vitest";
import { GmailCredentialTypes } from "../src/contracts/GmailCredentialTypes";
import {
  ModifyGmailLabels,
  type ModifyGmailLabelsInputJson,
  modifyGmailLabelsInputSchema,
} from "../src/nodes/ModifyGmailLabels";
import { ModifyGmailLabelsNode } from "../src/nodes/ModifyGmailLabelsNode";
import {
  ReplyToGmailMessage,
  type ReplyToGmailMessageInputJson,
  replyToGmailMessageInputSchema,
} from "../src/nodes/ReplyToGmailMessage";
import {
  SendGmailMessage,
  type SendGmailMessageInputJson,
  sendGmailMessageInputSchema,
} from "../src/nodes/SendGmailMessage";
import { SendGmailMessageNode } from "../src/nodes/SendGmailMessageNode";
import { ReplyToGmailMessageNode } from "../src/nodes/ReplyToGmailMessageNode";
import { GmailModifyLabelsService } from "../src/services/GmailModifyLabelsService";
import { GmailReplyToMessageService } from "../src/services/GmailReplyToMessageService";
import { GmailSendMessageService } from "../src/services/GmailSendMessageService";

class FakeGmailSendMessageService {
  readonly calls: unknown[] = [];

  async send(input: unknown): Promise<Readonly<{ messageId: string }>> {
    this.calls.push(input);
    return { messageId: "sent_1" };
  }
}

class FakeGmailReplyToMessageService {
  readonly calls: unknown[] = [];

  async reply(input: unknown): Promise<Readonly<{ messageId: string }>> {
    this.calls.push(input);
    return { messageId: "reply_1" };
  }
}

class FakeGmailModifyLabelsService {
  readonly calls: unknown[] = [];

  async modify(input: unknown): Promise<Readonly<{ threadId: string; target: "thread" }>> {
    this.calls.push(input);
    return { target: "thread", threadId: "thread_1" };
  }
}

class GmailActionNodesFixture {
  static createRunnableArgs<TConfig, TInput>(config: TConfig, input: TInput) {
    const item = { json: input };
    return {
      input,
      item,
      itemIndex: 0,
      items: [item],
      ctx: {
        config,
      },
    } as never;
  }

  static asRecord(value: unknown): Record<string, unknown> {
    return value as Record<string, unknown>;
  }
}

test("SendGmailMessage declares the Gmail auth requirement", () => {
  const config = new SendGmailMessage("Send Gmail");
  assert.deepEqual(config.getCredentialRequirements(), [
    {
      slotKey: "auth",
      label: "Gmail account",
      acceptedTypes: [GmailCredentialTypes.oauth],
      helpText: "Bind a Gmail OAuth credential that resolves to an authenticated Gmail session.",
    },
  ]);
});

test("SendGmailMessage input schema validates composable wire json", () => {
  const input = sendGmailMessageInputSchema.parse({
    to: "buyer@example.com, teammate@example.com",
    subject: " Quote response ",
    attachments: [{ binaryName: "quote", filename: "quote.pdf" }],
  });
  assert.deepEqual(input, {
    to: "buyer@example.com, teammate@example.com",
    subject: "Quote response",
    attachments: [{ binaryName: "quote", filename: "quote.pdf" }],
  } satisfies SendGmailMessageInputJson);
  assert.throws(() => sendGmailMessageInputSchema.parse({ to: "", subject: "Quote" }));
});

test("SendGmailMessageNode passes parsed input and item to the service", async () => {
  const service = new FakeGmailSendMessageService();
  const node = new SendGmailMessageNode(service as unknown as GmailSendMessageService);
  const config = new SendGmailMessage("Send Gmail");
  const input = sendGmailMessageInputSchema.parse({
    to: "buyer@example.com",
    subject: "Quote response",
  });
  const result = await node.execute(GmailActionNodesFixture.createRunnableArgs(config, input));
  assert.deepEqual(result, {
    json: { messageId: "sent_1" },
  });
  assert.equal(service.calls.length, 1);
  const call = GmailActionNodesFixture.asRecord(service.calls[0]);
  assert.deepEqual(call["input"], input);
  assert.deepEqual(GmailActionNodesFixture.asRecord(call["item"])["json"], input);
});

test("ReplyToGmailMessage input schema validates message fields", () => {
  const input = replyToGmailMessageInputSchema.parse({
    messageId: " original_1 ",
    html: "<p>Thanks</p>",
    replyToSenderOnly: true,
  });
  assert.deepEqual(input, {
    messageId: "original_1",
    html: "<p>Thanks</p>",
    replyToSenderOnly: true,
  } satisfies ReplyToGmailMessageInputJson);
  assert.throws(() => replyToGmailMessageInputSchema.parse({ messageId: "" }));
});

test("ReplyToGmailMessageNode passes parsed input and item to the service", async () => {
  const service = new FakeGmailReplyToMessageService();
  const node = new ReplyToGmailMessageNode(service as unknown as GmailReplyToMessageService);
  const config = new ReplyToGmailMessage("Reply Gmail");
  const input = replyToGmailMessageInputSchema.parse({
    messageId: "message_1",
    text: "Thanks",
  });
  const result = await node.execute(GmailActionNodesFixture.createRunnableArgs(config, input));
  assert.deepEqual(result, {
    json: { messageId: "reply_1" },
  });
  assert.equal(service.calls.length, 1);
  const call = GmailActionNodesFixture.asRecord(service.calls[0]);
  assert.deepEqual(call["input"], input);
});

test("ModifyGmailLabels input schema validates label mutation wire json", () => {
  const input = modifyGmailLabelsInputSchema.parse({
    target: "thread",
    threadId: "thread_1",
    addLabels: ["Done"],
  });
  assert.deepEqual(input, {
    target: "thread",
    threadId: "thread_1",
    addLabels: ["Done"],
  } satisfies ModifyGmailLabelsInputJson);
  assert.throws(() => modifyGmailLabelsInputSchema.parse({ target: "invalid" }));
});

test("ModifyGmailLabelsNode passes parsed input to the service", async () => {
  const service = new FakeGmailModifyLabelsService();
  const node = new ModifyGmailLabelsNode(service as unknown as GmailModifyLabelsService);
  const config = new ModifyGmailLabels("Label Gmail");
  const input = modifyGmailLabelsInputSchema.parse({
    target: "thread",
    threadId: "thread_1",
    addLabels: ["Done"],
  });
  const result = await node.execute(GmailActionNodesFixture.createRunnableArgs(config, input));
  assert.deepEqual(result, {
    json: { target: "thread", threadId: "thread_1" },
  });
  assert.equal(service.calls.length, 1);
  const call = GmailActionNodesFixture.asRecord(service.calls[0]);
  assert.deepEqual(call["input"], input);
});
