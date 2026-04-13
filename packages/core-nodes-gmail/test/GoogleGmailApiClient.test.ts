import assert from "node:assert/strict";
import { test } from "vitest";
import { GmailMimeMessageFactory } from "../src/adapters/google/GmailMimeMessageFactory";
import { GoogleGmailApiClientFactory } from "../src/adapters/google/GoogleGmailApiClientFactory";
import type { GmailSession } from "../src/contracts/GmailSession";
import type { GmailMessageRecord } from "../src/services/GmailApiClient";

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
