import assert from "node:assert/strict";
import { test } from "vitest";
import { GmailMimeMessageFactory } from "../src/adapters/google/GmailMimeMessageFactory";
import { GoogleGmailApiClientFactory } from "../src/adapters/google/GoogleGmailApiClientFactory";
import type { GmailSession } from "../src/contracts/GmailSession";
import type { GmailMessageAttachmentRecord, GmailMessageRecord } from "../src/services/GmailApiClient";

class FakeGoogleGmailClient {
  readonly sentRequests: unknown[] = [];
  readonly modifiedRequests: unknown[] = [];
  readonly threadModifiedRequests: unknown[] = [];

  private readonly messagesById: Readonly<Record<string, unknown>>;

  constructor(messagesById: Readonly<Record<string, unknown>>) {
    this.messagesById = messagesById;
  }

  readonly users = {
    getProfile: async () => ({
      data: {
        historyId: "history_profile",
        emailAddress: "ops@example.com",
      },
    }),
    messages: {
      list: async () => ({
        data: {
          messages: [{ id: "message_1" }],
        },
      }),
      get: async (args: Readonly<{ id?: string }>) => ({
        data: this.messagesById[args.id ?? ""] ?? {},
      }),
      send: async (args: unknown) => {
        this.sentRequests.push(args);
        return {
          data: {
            id: "sent_1",
          },
        };
      },
      modify: async (args: unknown) => {
        this.modifiedRequests.push(args);
        return {
          data: {
            id: "message_1",
          },
        };
      },
      attachments: {
        get: async () => ({
          data: {
            data: Buffer.from("attachment body").toString("base64url"),
            size: 15,
          },
        }),
      },
    },
    labels: {
      list: async () => ({
        data: {
          labels: [{ id: "INBOX", name: "Inbox" }],
        },
      }),
    },
    threads: {
      modify: async (args: unknown) => {
        this.threadModifiedRequests.push(args);
        return {
          data: {},
        };
      },
    },
  };
}

class GoogleGmailApiClientFixture {
  static createSession(): Readonly<{ session: GmailSession; gmailClient: FakeGoogleGmailClient }> {
    const gmailClient = new FakeGoogleGmailClient({
      original: {
        id: "original",
        threadId: "thread_1",
        payload: {
          headers: [
            { name: "From", value: "Buyer <buyer@example.com>" },
            { name: "To", value: "ops@example.com" },
            { name: "Cc", value: "teammate@example.com" },
            { name: "Subject", value: "Quote request" },
            { name: "Message-ID", value: "<message@example.com>" },
            { name: "References", value: "<root@example.com>" },
          ],
        },
      },
      message_1: {
        id: "message_1",
        labelIds: ["Label_done"],
        payload: {
          headers: [{ name: "Subject", value: "Done" }],
        },
      },
      sent_1: {
        id: "sent_1",
        threadId: "thread_1",
        labelIds: ["SENT"],
        payload: {
          headers: [{ name: "Subject", value: "Re: Quote request" }],
        },
      },
    });
    return {
      gmailClient,
      session: {
        auth: {} as never,
        client: gmailClient as never,
        userId: "me",
        emailAddress: "ops@example.com",
        scopes: [],
      },
    };
  }

  static decodeRaw(value: string): string {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  static asRecord(value: unknown): Record<string, unknown> {
    return value as Record<string, unknown>;
  }

  static asMessageRecord(value: unknown): GmailMessageRecord {
    return value as GmailMessageRecord;
  }
}

test("GmailMimeMessageFactory creates multipart MIME for text, html, and attachments", () => {
  const factory = new GmailMimeMessageFactory();
  const raw = factory.createMessage({
    to: ["buyer@example.com"],
    subject: "Invoice 42",
    text: "plain body",
    html: "<p>html body</p>",
    attachments: [
      {
        filename: "invoice.txt",
        mimeType: "text/plain",
        body: "attachment body",
      },
    ],
  });
  const decoded = GoogleGmailApiClientFixture.decodeRaw(raw);
  assert.match(decoded, /To: buyer@example.com/);
  assert.match(decoded, /multipart\/mixed/);
  assert.match(decoded, /multipart\/alternative/);
  assert.match(decoded, /Content-Type: text\/html/);
  assert.match(decoded, /Content-Disposition: attachment; filename="invoice.txt"/);
});

test("GoogleGmailApiClient.replyToMessage keeps threading headers and excludes the connected mailbox", async () => {
  const { session, gmailClient } = GoogleGmailApiClientFixture.createSession();
  const client = new GoogleGmailApiClientFactory().create(session);
  await client.replyToMessage({
    messageId: "original",
    text: "Thanks for the RFQ.",
  });
  assert.equal(gmailClient.sentRequests.length, 1);
  const request = GoogleGmailApiClientFixture.asRecord(gmailClient.sentRequests[0]);
  const requestBody = GoogleGmailApiClientFixture.asRecord(request["requestBody"]);
  assert.equal(requestBody["threadId"], "thread_1");
  const decoded = GoogleGmailApiClientFixture.decodeRaw(String(requestBody["raw"]));
  assert.match(decoded, /To: buyer@example.com, teammate@example.com/);
  assert.match(decoded, /Subject: Re: Quote request/);
  assert.match(decoded, /In-Reply-To: <message@example.com>/);
  assert.match(decoded, /References: <root@example.com> <message@example.com>/);
});

test("GoogleGmailApiClient.modifyMessageLabels refreshes the updated message", async () => {
  const { session, gmailClient } = GoogleGmailApiClientFixture.createSession();
  const client = new GoogleGmailApiClientFactory().create(session);
  const message = await client.modifyMessageLabels({
    messageId: "message_1",
    addLabelIds: ["Label_done"],
    removeLabelIds: ["INBOX"],
  });
  assert.equal(gmailClient.modifiedRequests.length, 1);
  const request = GoogleGmailApiClientFixture.asRecord(gmailClient.modifiedRequests[0]);
  const requestBody = GoogleGmailApiClientFixture.asRecord(request["requestBody"]);
  assert.deepEqual(requestBody["addLabelIds"], ["Label_done"]);
  assert.deepEqual(requestBody["removeLabelIds"], ["INBOX"]);
  assert.deepEqual(GoogleGmailApiClientFixture.asMessageRecord(message).labelIds, ["Label_done"]);
});

class ConfigurableFakeGoogleGmailClient {
  profileHistoryId: string | undefined = "history_profile";
  readonly listCalls: unknown[] = [];
  readonly getCalls: unknown[] = [];
  readonly sendCalls: unknown[] = [];
  readonly modifiedCalls: unknown[] = [];
  readonly threadModifiedCalls: unknown[] = [];
  readonly attachmentCalls: unknown[] = [];
  sendMessageId: string | undefined = "sent_1";
  attachmentResponse: Readonly<{ data?: string | null; size?: number | null }> = {
    data: Buffer.from("attachment body").toString("base64url"),
    size: 15,
  };

  messagesById: Readonly<Record<string, unknown>>;

  constructor(messagesById: Readonly<Record<string, unknown>>) {
    this.messagesById = messagesById;
  }

  readonly users = {
    getProfile: async () => ({
      data: {
        historyId: this.profileHistoryId,
        emailAddress: "ops@example.com",
      },
    }),
    messages: {
      list: async (args: unknown) => {
        this.listCalls.push(args);
        return {
          data: {
            messages: [{ id: "message_1" }],
          },
        };
      },
      get: async (args: Readonly<{ id?: string; format?: string }>) => {
        this.getCalls.push(args);
        return {
          data: this.messagesById[args.id ?? ""] ?? {},
        };
      },
      send: async (args: unknown) => {
        this.sendCalls.push(args);
        return {
          data: {
            id: this.sendMessageId,
          },
        };
      },
      modify: async (args: unknown) => {
        this.modifiedCalls.push(args);
        return { data: { id: "message_1" } };
      },
      attachments: {
        get: async (args: unknown) => {
          this.attachmentCalls.push(args);
          return { data: this.attachmentResponse };
        },
      },
    },
    labels: {
      list: async () => ({
        data: {
          labels: [
            { id: "INBOX", name: "Inbox" },
            { id: null, name: "Bad" },
            { id: "x", name: "y", type: "system" },
          ],
        },
      }),
    },
    threads: {
      modify: async (args: unknown) => {
        this.threadModifiedCalls.push(args);
        return { data: {} };
      },
    },
  };
}

function sessionWithClient(gmailClient: ConfigurableFakeGoogleGmailClient): GmailSession {
  return {
    auth: {} as never,
    client: gmailClient as never,
    userId: "me",
    emailAddress: "ops@example.com",
    scopes: [],
  };
}

test("GoogleGmailApiClient.getCurrentHistoryId throws when Gmail omits historyId", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({});
  gmailClient.profileHistoryId = undefined;
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  await assert.rejects(() => client.getCurrentHistoryId({ mailbox: "me" }), /history id/);
});

test("GoogleGmailApiClient.listMessageIds forwards query, labelIds, and maxResults", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({});
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  const ids = await client.listMessageIds({
    mailbox: "me",
    query: "is:unread",
    labelIds: ["INBOX"],
    maxResults: 5,
  });
  assert.deepEqual(ids, ["message_1"]);
  assert.equal(gmailClient.listCalls.length, 1);
  const call = GoogleGmailApiClientFixture.asRecord(gmailClient.listCalls[0]);
  assert.equal(call["q"], "is:unread");
  assert.deepEqual(call["labelIds"], ["INBOX"]);
  assert.equal(call["maxResults"], 5);
});

test("GoogleGmailApiClient.listLabels maps label ids and optional types", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({});
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  const labels = await client.listLabels({ mailbox: "me" });
  assert.deepEqual(labels, [
    { id: "INBOX", name: "Inbox", type: undefined },
    { id: "x", name: "y", type: "system" },
  ]);
});

test("GoogleGmailApiClient.getAttachmentContent decodes base64url bodies", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({});
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  const attachment: GmailMessageAttachmentRecord = {
    attachmentId: "att_1",
    mimeType: "text/plain",
    filename: "f.txt",
    size: 10,
    binaryName: "f_txt",
  };
  const content = await client.getAttachmentContent({
    mailbox: "me",
    messageId: "message_1",
    attachment,
  });
  assert.equal(content.attachmentId, "att_1");
  assert.equal(Buffer.from(content.body).toString("utf8"), "attachment body");
  assert.equal(gmailClient.attachmentCalls.length, 1);
});

test("GoogleGmailApiClient.getAttachmentContent throws when Gmail omits attachment bytes", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({});
  gmailClient.attachmentResponse = { data: undefined, size: undefined };
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  const attachment: GmailMessageAttachmentRecord = {
    attachmentId: "att_1",
    mimeType: "text/plain",
    binaryName: "b",
  };
  await assert.rejects(
    () =>
      client.getAttachmentContent({
        mailbox: "me",
        messageId: "message_1",
        attachment,
      }),
    /did not return attachment content/,
  );
});

test("GoogleGmailApiClient.sendRawMessage throws when Gmail omits message id", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({
    sent_1: { id: "sent_1", payload: { headers: [] } },
  });
  gmailClient.sendMessageId = undefined;
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  await assert.rejects(
    () => client.sendRawMessage({ raw: Buffer.from("x").toString("base64url") }),
    /did not return a message id/,
  );
});

test("GoogleGmailApiClient.getMessage throws when Gmail omits message id", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({
    broken: { payload: { headers: [] } },
  });
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  await assert.rejects(() => client.getMessage({ mailbox: "me", messageId: "broken" }), /message metadata/);
});

test("GoogleGmailApiClient.modifyThreadLabels calls threads.modify", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({});
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  await client.modifyThreadLabels({
    threadId: "thread_9",
    addLabelIds: ["INBOX"],
    removeLabelIds: [],
  });
  assert.equal(gmailClient.threadModifiedCalls.length, 1);
  const call = GoogleGmailApiClientFixture.asRecord(gmailClient.threadModifiedCalls[0]);
  assert.equal(call["id"], "thread_9");
});

test("GoogleGmailApiClient.replyToMessage throws when no recipients remain after filtering self", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({
    solo: {
      id: "solo",
      threadId: "t1",
      payload: {
        headers: [{ name: "From", value: "ops@example.com" }],
      },
    },
  });
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  await assert.rejects(() => client.replyToMessage({ messageId: "solo", text: "x" }), /reply recipients/);
});

test("GoogleGmailApiClient.replyToMessage uses replyToSenderOnly and custom html attachments", async () => {
  const gmailClient = new ConfigurableFakeGoogleGmailClient({
    original: {
      id: "original",
      threadId: "thread_1",
      payload: {
        headers: [
          { name: "From", value: "Buyer <buyer@example.com>" },
          { name: "To", value: "ops@example.com" },
          { name: "Subject", value: "Hello" },
          { name: "Message-ID", value: "<mid@example.com>" },
        ],
      },
    },
    sent_1: {
      id: "sent_1",
      threadId: "thread_1",
      labelIds: ["SENT"],
      payload: { headers: [] },
    },
  });
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  await client.replyToMessage({
    messageId: "original",
    replyToSenderOnly: true,
    html: "<p>Hi</p>",
    attachments: [{ filename: "a.txt", mimeType: "text/plain", body: "z", disposition: "attachment" }],
    headers: { "X-Thread": "1" },
    subject: "Re: Hello",
  });
  assert.equal(gmailClient.sendCalls.length, 1);
  const sendCall = GoogleGmailApiClientFixture.asRecord(gmailClient.sendCalls[0]);
  const body = GoogleGmailApiClientFixture.asRecord(sendCall["requestBody"]);
  const raw = GoogleGmailApiClientFixture.decodeRaw(String(body["raw"]));
  assert.match(raw, /To: buyer@example.com/);
  assert.match(raw, /Subject: Re: Hello/);
});

test("GoogleGmailApiClient collects nested attachments and stable binary names", async () => {
  const nestedMessage = {
    id: "nested",
    payload: {
      mimeType: "multipart/mixed",
      parts: [
        {
          filename: "a.txt",
          mimeType: "text/plain",
          body: { attachmentId: "att_a", size: 1 },
        },
        {
          filename: "a.txt",
          mimeType: "text/plain",
          body: { attachmentId: "att_b", size: 2 },
        },
        {
          filename: "weird name!.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "att_c", size: 3 },
        },
      ],
    },
  };
  const gmailClient = new ConfigurableFakeGoogleGmailClient({
    nested: nestedMessage,
  });
  const client = new GoogleGmailApiClientFactory().create(sessionWithClient(gmailClient));
  const message = await client.getMessage({ mailbox: "me", messageId: "nested" });
  assert.equal(message.attachments.length, 3);
  assert.equal(message.attachments[0]?.binaryName, "a.txt");
  assert.equal(message.attachments[1]?.binaryName, "a.txt_2");
  assert.equal(message.attachments[2]?.binaryName, "weird_name_.pdf");
});
