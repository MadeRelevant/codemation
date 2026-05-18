import type {
  GmailApiClient,
  GmailMessageAttachmentContent,
  GmailMessageRecord,
} from "../../src/services/GmailApiClient";
import type { GmailSession } from "../../src/contracts/GmailSession";

/**
 * In-memory GmailApiClient. Records send/reply/label calls so tests can assert on them.
 * Returns sensible defaults from read operations so tests only need to override what matters.
 */
export class FakeGmailApiClient implements GmailApiClient {
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
      body: (async function* () {
        yield new Uint8Array();
      })(),
      mimeType: "application/octet-stream",
    };
  }

  async sendMessage(args: unknown): Promise<GmailMessageRecord> {
    this.sendRequests.push(args);
    return { messageId: "sent_1", threadId: "thread_sent", labelIds: ["SENT"], headers: {}, attachments: [] };
  }

  async sendRawMessage(_args: unknown): Promise<GmailMessageRecord> {
    return { messageId: "raw_1", threadId: "thread_raw", labelIds: ["SENT"], headers: {}, attachments: [] };
  }

  async replyToMessage(args: unknown): Promise<GmailMessageRecord> {
    this.replyRequests.push(args);
    return { messageId: "reply_1", threadId: "thread_1", labelIds: ["SENT"], headers: {}, attachments: [] };
  }

  async modifyMessageLabels(args: unknown): Promise<GmailMessageRecord> {
    this.messageLabelRequests.push(args);
    return { messageId: "message_1", labelIds: ["INBOX", "Label_done"], headers: {}, attachments: [] };
  }

  async modifyThreadLabels(args: unknown): Promise<void> {
    this.threadLabelRequests.push(args);
  }
}

/**
 * Factory that always returns the provided FakeGmailApiClient (or a new one by default).
 */
export class FakeGoogleGmailApiClientFactory {
  readonly client: FakeGmailApiClient;

  constructor(client?: FakeGmailApiClient) {
    this.client = client ?? new FakeGmailApiClient();
  }

  create(_session: GmailSession): GmailApiClient {
    return this.client;
  }
}
