import assert from "node:assert/strict";
import { itemValue } from "@codemation/core";
import { test } from "vitest";
import { GmailCredentialTypes } from "../src/contracts/GmailCredentialTypes";
import { ModifyGmailLabels } from "../src/nodes/ModifyGmailLabels";
import { ModifyGmailLabelsNode } from "../src/nodes/ModifyGmailLabelsNode";
import { ReplyToGmailMessage } from "../src/nodes/ReplyToGmailMessage";
import { ReplyToGmailMessageNode } from "../src/nodes/ReplyToGmailMessageNode";
import { SendGmailMessage } from "../src/nodes/SendGmailMessage";
import { SendGmailMessageNode } from "../src/nodes/SendGmailMessageNode";
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
    return {
      input,
      item: { json: input },
      itemIndex: 0,
      items: [{ json: input }],
      ctx: {
        config,
      },
    } as never;
  }
}

test("SendGmailMessage declares the Gmail auth requirement", () => {
  const config = new SendGmailMessage("Send Gmail", {
    to: "buyer@example.com",
    subject: "Quote response",
  });
  assert.deepEqual(config.getCredentialRequirements(), [
    {
      slotKey: "auth",
      label: "Gmail account",
      acceptedTypes: [GmailCredentialTypes.oauth],
      helpText: "Bind a Gmail OAuth credential that resolves to an authenticated Gmail session.",
    },
  ]);
});

test("SendGmailMessageNode returns the service output as item json", async () => {
  const service = new FakeGmailSendMessageService();
  const node = new SendGmailMessageNode(service as unknown as GmailSendMessageService);
  const config = new SendGmailMessage("Send Gmail", {
    to: "buyer@example.com",
    subject: "Quote response",
  });
  const result = await node.execute(
    GmailActionNodesFixture.createRunnableArgs(config, {
      any: "input",
    }),
  );
  assert.deepEqual(result, {
    json: { messageId: "sent_1" },
  });
  assert.equal(service.calls.length, 1);
});

test("ReplyToGmailMessageNode returns the service output as item json", async () => {
  const service = new FakeGmailReplyToMessageService();
  const node = new ReplyToGmailMessageNode(service as unknown as GmailReplyToMessageService);
  const config = new ReplyToGmailMessage("Reply Gmail", {
    messageId: "message_1",
    text: "Thanks",
  });
  const result = await node.execute(
    GmailActionNodesFixture.createRunnableArgs(config, {
      any: "input",
    }),
  );
  assert.deepEqual(result, {
    json: { messageId: "reply_1" },
  });
  assert.equal(service.calls.length, 1);
});

test("ModifyGmailLabels defaults to message target", () => {
  const config = new ModifyGmailLabels("Label Gmail", {
    messageId: "message_1",
    addLabels: ["Done"],
  });
  assert.equal(config.target, "message");
});

test("ModifyGmailLabelsNode returns the service output as item json", async () => {
  const service = new FakeGmailModifyLabelsService();
  const node = new ModifyGmailLabelsNode(service as unknown as GmailModifyLabelsService);
  const config = new ModifyGmailLabels("Label Gmail", {
    target: "thread",
    threadId: "thread_1",
    addLabels: ["Done"],
  });
  const result = await node.execute(
    GmailActionNodesFixture.createRunnableArgs(config, {
      any: "input",
    }),
  );
  assert.deepEqual(result, {
    json: { target: "thread", threadId: "thread_1" },
  });
  assert.equal(service.calls.length, 1);
});

test("SendGmailMessage config supports itemValue-driven fields", () => {
  const config = new SendGmailMessage("Send Gmail", {
    to: itemValue(({ item }) => String((item.json as Record<string, unknown>)["recipient"] ?? "")),
    subject: itemValue(({ item }) => String((item.json as Record<string, unknown>)["subject"] ?? "")),
  });
  assert.equal(typeof config.cfg.to, "object");
  assert.equal(typeof config.cfg.subject, "object");
});
