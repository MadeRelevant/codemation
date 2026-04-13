import type { gmail_v1 } from "googleapis";
import type { GmailSession } from "../../contracts/GmailSession";
import type {
  GmailApiClient,
  GmailMessageAttachmentContent,
  GmailMessageAttachmentRecord,
  GmailMessageRecord,
  GmailReplyToMessageArgs,
  GmailSendMessageArgs,
  GmailSendRawMessageArgs,
} from "../../services/GmailApiClient";
import { GmailMessagePayloadTextExtractor } from "./GmailMessagePayloadTextExtractor";
import { GmailMimeMessageFactory } from "./GmailMimeMessageFactory";

type GmailReplyContext = Readonly<{
  messageIdHeader?: string;
  references?: string;
  replyRecipients: ReadonlyArray<string>;
  subject: string;
  threadId?: string;
}>;

export class GoogleGmailApiClient implements GmailApiClient {
  constructor(
    private readonly session: GmailSession,
    private readonly messagePayloadTextExtractor: GmailMessagePayloadTextExtractor,
    private readonly mimeMessageFactory: GmailMimeMessageFactory,
  ) {}

  async getCurrentHistoryId(args: Readonly<{ mailbox: string }>): Promise<string> {
    const response = await this.session.client.users.getProfile({
      userId: this.resolveUserId(args.mailbox),
    });
    if (!response.data.historyId) {
      throw new Error(`Gmail did not return a history id for mailbox ${args.mailbox}.`);
    }
    return response.data.historyId;
  }

  async listMessageIds(
    args: Readonly<{
      mailbox: string;
      labelIds?: ReadonlyArray<string>;
      query?: string;
      maxResults?: number;
    }>,
  ): Promise<ReadonlyArray<string>> {
    const response = await this.session.client.users.messages.list({
      userId: this.resolveUserId(args.mailbox),
      maxResults: Math.max(args.maxResults ?? 1, 1),
      q: args.query?.trim() ? args.query : undefined,
      labelIds: args.labelIds?.length ? [...args.labelIds] : undefined,
    });
    return (response.data.messages ?? [])
      .map((message) => message.id ?? undefined)
      .filter((messageId): messageId is string => typeof messageId === "string");
  }

  async listLabels(args: Readonly<{ mailbox: string }>): Promise<
    ReadonlyArray<{
      id: string;
      name: string;
      type?: string;
    }>
  > {
    const response = await this.session.client.users.labels.list({
      userId: this.resolveUserId(args.mailbox),
    });
    return (response.data.labels ?? [])
      .filter((label): label is Readonly<{ id: string; name: string; type?: string | null }> => {
        return typeof label.id === "string" && typeof label.name === "string";
      })
      .map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type ?? undefined,
      }));
  }

  async getMessage(
    args: Readonly<{
      mailbox: string;
      messageId: string;
    }>,
  ): Promise<GmailMessageRecord> {
    return await this.getMessageById(args.messageId, args.mailbox);
  }

  async getAttachmentContent(
    args: Readonly<{
      mailbox: string;
      messageId: string;
      attachment: GmailMessageAttachmentRecord;
    }>,
  ): Promise<GmailMessageAttachmentContent> {
    const response = await this.session.client.users.messages.attachments.get({
      userId: this.resolveUserId(args.mailbox),
      messageId: args.messageId,
      id: args.attachment.attachmentId,
    });
    const encodedData = response.data.data;
    if (!encodedData) {
      throw new Error(
        `Gmail did not return attachment content for ${args.attachment.attachmentId} on message ${args.messageId}.`,
      );
    }
    return {
      attachmentId: args.attachment.attachmentId,
      body: this.decodeBase64Url(encodedData),
      mimeType: args.attachment.mimeType,
      filename: args.attachment.filename,
      size: response.data.size ?? args.attachment.size,
    };
  }

  async sendMessage(args: GmailSendMessageArgs): Promise<GmailMessageRecord> {
    return await this.sendRawMessage({
      mailbox: args.mailbox,
      raw: this.mimeMessageFactory.createMessage(args),
    });
  }

  async sendRawMessage(args: GmailSendRawMessageArgs): Promise<GmailMessageRecord> {
    const response = await this.session.client.users.messages.send({
      userId: this.resolveUserId(args.mailbox),
      requestBody: {
        raw: args.raw,
        threadId: args.threadId,
      },
    });
    const messageId = response.data.id;
    if (!messageId) {
      throw new Error("Gmail did not return a message id after sending.");
    }
    return await this.getMessageById(messageId, args.mailbox ?? this.session.userId);
  }

  async replyToMessage(args: GmailReplyToMessageArgs): Promise<GmailMessageRecord> {
    const replyContext = await this.loadReplyContext(args.messageId, args.mailbox ?? this.session.userId, args);
    return await this.sendRawMessage({
      mailbox: args.mailbox,
      threadId: replyContext.threadId,
      raw: this.mimeMessageFactory.createMessage({
        mailbox: args.mailbox,
        to: [...replyContext.replyRecipients],
        subject: args.subject ?? replyContext.subject,
        text: args.text,
        html: args.html,
        attachments: args.attachments,
        headers: {
          ...(args.headers ?? {}),
          ...(replyContext.messageIdHeader ? { "In-Reply-To": replyContext.messageIdHeader } : {}),
          ...(replyContext.references ? { References: replyContext.references } : {}),
        },
      }),
    });
  }

  async modifyMessageLabels(
    args: Readonly<{
      mailbox?: string;
      messageId: string;
      addLabelIds?: ReadonlyArray<string>;
      removeLabelIds?: ReadonlyArray<string>;
    }>,
  ): Promise<GmailMessageRecord> {
    await this.session.client.users.messages.modify({
      userId: this.resolveUserId(args.mailbox),
      id: args.messageId,
      requestBody: {
        addLabelIds: args.addLabelIds?.length ? [...args.addLabelIds] : undefined,
        removeLabelIds: args.removeLabelIds?.length ? [...args.removeLabelIds] : undefined,
      },
    });
    return await this.getMessageById(args.messageId, args.mailbox ?? this.session.userId);
  }

  async modifyThreadLabels(
    args: Readonly<{
      mailbox?: string;
      threadId: string;
      addLabelIds?: ReadonlyArray<string>;
      removeLabelIds?: ReadonlyArray<string>;
    }>,
  ): Promise<void> {
    await this.session.client.users.threads.modify({
      userId: this.resolveUserId(args.mailbox),
      id: args.threadId,
      requestBody: {
        addLabelIds: args.addLabelIds?.length ? [...args.addLabelIds] : undefined,
        removeLabelIds: args.removeLabelIds?.length ? [...args.removeLabelIds] : undefined,
      },
    });
  }

  private async getMessageById(messageId: string, mailbox: string): Promise<GmailMessageRecord> {
    const response = await this.session.client.users.messages.get({
      userId: this.resolveUserId(mailbox),
      id: messageId,
      format: "full",
    });
    if (!response.data.id) {
      throw new Error(`Gmail did not return message metadata for ${messageId}.`);
    }
    return this.toMessageRecord(response.data);
  }

  private toMessageRecord(message: gmail_v1.Schema$Message): GmailMessageRecord {
    const bodies = this.messagePayloadTextExtractor.extract(message.payload);
    return {
      messageId: String(message.id),
      threadId: message.threadId ?? undefined,
      historyId: message.historyId ?? undefined,
      snippet: message.snippet ?? undefined,
      internalDate: message.internalDate ?? undefined,
      labelIds: message.labelIds ?? [],
      headers: this.toHeaderMap(message.payload?.headers ?? []),
      textPlain: bodies.textPlain,
      textHtml: bodies.textHtml,
      attachments: this.collectAttachments(message.payload),
    };
  }

  private async loadReplyContext(
    messageId: string,
    mailbox: string,
    args: GmailReplyToMessageArgs,
  ): Promise<GmailReplyContext> {
    const response = await this.session.client.users.messages.get({
      userId: this.resolveUserId(mailbox),
      id: messageId,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Reply-To", "Subject", "Message-ID", "References"],
    });
    if (!response.data.id) {
      throw new Error(`Gmail did not return reply metadata for ${messageId}.`);
    }
    const headers = this.toHeaderMap(response.data.payload?.headers ?? []);
    const primaryRecipients = this.parseAddresses(headers["Reply-To"] ?? headers.From);
    const allRecipients = this.dedupeAddresses([
      ...primaryRecipients,
      ...this.parseAddresses(headers.To),
      ...this.parseAddresses(headers.Cc),
    ]);
    const ownEmail = this.session.emailAddress?.toLowerCase();
    const filteredRecipients = (args.replyToSenderOnly ? primaryRecipients : allRecipients).filter((entry) => {
      return ownEmail ? entry.toLowerCase() !== ownEmail : true;
    });
    if (filteredRecipients.length === 0) {
      throw new Error(`Unable to determine reply recipients for Gmail message ${messageId}.`);
    }
    const messageIdHeader = headers["Message-ID"];
    const references = [headers.References, messageIdHeader].filter(
      (value): value is string => typeof value === "string",
    );
    return {
      messageIdHeader,
      references: references.length > 0 ? references.join(" ").trim() : undefined,
      replyRecipients: filteredRecipients,
      subject: this.ensureReplySubject(headers.Subject ?? ""),
      threadId: response.data.threadId ?? undefined,
    };
  }

  private ensureReplySubject(subject: string): string {
    const trimmed = subject.trim();
    if (!trimmed) {
      return "Re:";
    }
    return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
  }

  private parseAddresses(value: string | undefined): ReadonlyArray<string> {
    if (!value) {
      return [];
    }
    return this.dedupeAddresses(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const match = entry.match(/<([^>]+)>/);
          return (match?.[1] ?? entry).trim();
        }),
    );
  }

  private dedupeAddresses(values: ReadonlyArray<string>): ReadonlyArray<string> {
    return [...new Set(values.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
  }

  private resolveUserId(_mailbox: string | undefined): "me" {
    return this.session.userId;
  }

  private toHeaderMap(
    headers: ReadonlyArray<Readonly<{ name?: string | null; value?: string | null }>>,
  ): Readonly<Record<string, string>> {
    const valuesByHeader: Record<string, string> = {};
    for (const header of headers) {
      if (!header.name || !header.value) {
        continue;
      }
      valuesByHeader[header.name] = header.value;
    }
    return valuesByHeader;
  }

  private collectAttachments(payload: unknown): ReadonlyArray<GmailMessageAttachmentRecord> {
    const attachments: GmailMessageAttachmentRecord[] = [];
    this.collectAttachmentsFromPart(payload, attachments, {
      valueByName: new Map<string, number>(),
    });
    return attachments;
  }

  private collectAttachmentsFromPart(
    part: unknown,
    attachments: GmailMessageAttachmentRecord[],
    naming: Readonly<{ valueByName: Map<string, number> }>,
  ): void {
    if (!part || typeof part !== "object") {
      return;
    }
    const candidate = part as Readonly<{
      filename?: string | null;
      mimeType?: string | null;
      body?: Readonly<{
        attachmentId?: string | null;
        size?: number | null;
      }>;
      parts?: ReadonlyArray<unknown>;
    }>;
    const attachmentId = candidate.body?.attachmentId ?? undefined;
    if (attachmentId) {
      attachments.push({
        attachmentId,
        filename: candidate.filename ?? undefined,
        mimeType: candidate.mimeType ?? "application/octet-stream",
        size: candidate.body?.size ?? undefined,
        binaryName: this.createAttachmentBinaryName(
          candidate.filename ?? undefined,
          attachments.length,
          naming.valueByName,
        ),
      });
    }
    for (const child of candidate.parts ?? []) {
      this.collectAttachmentsFromPart(child, attachments, naming);
    }
  }

  private createAttachmentBinaryName(
    filename: string | undefined,
    attachmentIndex: number,
    valueByName: Map<string, number>,
  ): string {
    const baseName = this.sanitizeBinaryName(filename ?? `attachment_${attachmentIndex + 1}`);
    const previousCount = valueByName.get(baseName) ?? 0;
    valueByName.set(baseName, previousCount + 1);
    if (previousCount === 0) {
      return baseName;
    }
    return `${baseName}_${previousCount + 1}`;
  }

  private sanitizeBinaryName(value: string): string {
    const normalized = value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized.length > 0 ? normalized : "attachment";
  }

  private decodeBase64Url(value: string): Uint8Array {
    const base64Value = value.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(Buffer.from(base64Value, "base64"));
  }
}
