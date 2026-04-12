import assert from "node:assert/strict";
import { test } from "vitest";
import { GoogleGmailApiClientFactory } from "../src/adapters/google/GoogleGmailApiClientFactory";
import { GmailTriggerAttachmentService } from "../src/services/GmailTriggerAttachmentService";
import type { GmailApiClient, GmailMessageAttachmentContent } from "../src/services/GmailApiClient";

class FakeGmailApiClient implements GmailApiClient {
  attachmentRequests: unknown[] = [];

  async getCurrentHistoryId(): Promise<string> {
    return "history_1";
  }

  async listMessageIds(): Promise<ReadonlyArray<string>> {
    return [];
  }

  async listLabels(): Promise<ReadonlyArray<{ id: string; name: string }>> {
    return [];
  }

  async getMessage(): Promise<never> {
    throw new Error("not used");
  }

  async getAttachmentContent(args: unknown): Promise<GmailMessageAttachmentContent> {
    this.attachmentRequests.push(args);
    return {
      attachmentId: "attachment_1",
      body: new Uint8Array([1, 2, 3]),
      mimeType: "application/pdf",
      filename: "invoice.pdf",
      size: 3,
    };
  }

  async sendMessage(): Promise<never> {
    throw new Error("not used");
  }

  async sendRawMessage(): Promise<never> {
    throw new Error("not used");
  }

  async replyToMessage(): Promise<never> {
    throw new Error("not used");
  }

  async modifyMessageLabels(): Promise<never> {
    throw new Error("not used");
  }

  async modifyThreadLabels(): Promise<void> {}
}

class FakeGoogleGmailApiClientFactory {
  constructor(private readonly client: GmailApiClient) {}

  create(): GmailApiClient {
    return this.client;
  }
}

test("GmailTriggerAttachmentService downloads Gmail attachments into workflow binary storage", async () => {
  const client = new FakeGmailApiClient();
  const service = new GmailTriggerAttachmentService(
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
  );
  const attachedBodies: unknown[] = [];
  const items = await service.attachForItems(
    [
      {
        json: {
          mailbox: "sales@example.com",
          historyId: "history_1",
          messageId: "message_1",
          labelIds: [],
          headers: {},
          attachments: [
            {
              attachmentId: "attachment_1",
              mimeType: "application/pdf",
              binaryName: "invoice_pdf",
              filename: "invoice.pdf",
            },
          ],
        },
      },
    ],
    {
      config: {
        cfg: {
          mailbox: "sales@example.com",
          downloadAttachments: true,
        },
      },
      getCredential: async () =>
        ({
          auth: {} as never,
          client: {} as never,
          userId: "me",
          scopes: [],
        }) as never,
      binary: {
        attach: async (args: unknown) => {
          attachedBodies.push(args);
          return { binaryId: "binary_1" };
        },
        withAttachment: (_item: unknown, key: string, attachment: unknown) => ({
          json: {
            mailbox: "sales@example.com",
            historyId: "history_1",
            messageId: "message_1",
            labelIds: [],
            headers: {},
            attachments: [],
          },
          binary: {
            [key]: attachment,
          },
        }),
      },
    } as never,
  );
  assert.equal(client.attachmentRequests.length, 1);
  assert.equal(attachedBodies.length, 1);
  const attachmentBinary = items[0]?.binary?.["invoice_pdf"] as Record<string, unknown> | undefined;
  assert.equal(attachmentBinary?.["binaryId"], "binary_1");
});

test("GmailTriggerAttachmentService returns items unchanged when attachment download is disabled", async () => {
  const client = new FakeGmailApiClient();
  const service = new GmailTriggerAttachmentService(
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
  );
  const items = [
    {
      json: {
        mailbox: "sales@example.com",
        historyId: "history_1",
        messageId: "message_1",
        labelIds: [],
        headers: {},
        attachments: [],
      },
    },
  ];
  const output = await service.attachForItems(items, {
    config: {
      cfg: {
        mailbox: "sales@example.com",
        downloadAttachments: false,
      },
    },
  } as never);
  assert.equal(output, items);
  assert.equal(client.attachmentRequests.length, 0);
});
