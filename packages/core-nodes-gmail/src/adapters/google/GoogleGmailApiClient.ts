import type { CredentialInput, CredentialService } from "@codemation/core";
import { CoreTokens, inject, injectable, resolveCredential } from "@codemation/core";
import { google } from "googleapis";
import type { GmailServiceAccountCredential } from "../../contracts/GmailServiceAccountCredential";
import {
  GmailHistoryGapError,
  type GmailApiClient,
  type GmailHistoryDelta,
  type GmailMessageAttachmentContent,
  type GmailMessageAttachmentRecord,
  type GmailMessageRecord,
  type GmailWatchRegistration,
} from "../../services/GmailApiClient";

@injectable()
export class GoogleGmailApiClient implements GmailApiClient {
  constructor(@inject(CoreTokens.CredentialService) private readonly credentialService: CredentialService) {}

  async getCurrentHistoryId(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
  }>): Promise<string> {
    const session = await this.createSession(args.credential);
    const response = await session.gmailClient.users.getProfile({
      userId: session.userId,
    });
    if (!response.data.historyId) {
      throw new Error(`Gmail did not return a history id for mailbox ${args.mailbox}.`);
    }
    return response.data.historyId;
  }

  async listMessageIds(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    labelIds?: ReadonlyArray<string>;
    query?: string;
    maxResults?: number;
  }>): Promise<ReadonlyArray<string>> {
    const session = await this.createSession(args.credential);
    const response = await session.gmailClient.users.messages.list({
      userId: session.userId,
      maxResults: Math.max(args.maxResults ?? 1, 1),
      q: args.query?.trim() ? args.query : undefined,
      labelIds: args.labelIds?.length ? [...args.labelIds] : undefined,
    });
    return (response.data.messages ?? [])
      .map((message) => message.id ?? undefined)
      .filter((messageId): messageId is string => typeof messageId === "string");
  }

  async listLabels(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
  }>): Promise<ReadonlyArray<{
    id: string;
    name: string;
    type?: string;
  }>> {
    void args.mailbox;
    const session = await this.createSession(args.credential);
    const response = await session.gmailClient.users.labels.list({
      userId: session.userId,
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

  async watchMailbox(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    topicName: string;
    labelIds?: ReadonlyArray<string>;
  }>): Promise<GmailWatchRegistration> {
    const session = await this.createSession(args.credential);
    const response = await session.gmailClient.users.watch({
      userId: session.userId,
      requestBody: {
        topicName: args.topicName,
        labelIds: args.labelIds?.length ? [...args.labelIds] : undefined,
        labelFilterBehavior: args.labelIds?.length ? "INCLUDE" : undefined,
      },
    });
    if (!response.data.historyId || !response.data.expiration) {
      throw new Error(`Gmail did not return watch metadata for mailbox ${args.mailbox}.`);
    }
    return {
      historyId: response.data.historyId,
      expirationAt: new Date(Number(response.data.expiration)).toISOString(),
    };
  }

  async listAddedMessageIds(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    startHistoryId: string;
  }>): Promise<GmailHistoryDelta> {
    const session = await this.createSession(args.credential);
    try {
      const response = await session.gmailClient.users.history.list({
        userId: session.userId,
        startHistoryId: args.startHistoryId,
        historyTypes: ["messageAdded"],
      });
      return {
        historyId: response.data.historyId ?? args.startHistoryId,
        messageIds: this.collectMessageIds(response.data.history ?? []),
      };
    } catch (error) {
      if (this.isHistoryGap(error)) {
        throw new GmailHistoryGapError();
      }
      throw error;
    }
  }

  async getMessage(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    messageId: string;
  }>): Promise<GmailMessageRecord> {
    const session = await this.createSession(args.credential);
    const response = await session.gmailClient.users.messages.get({
      userId: session.userId,
      id: args.messageId,
      format: "full",
    });
    if (!response.data.id) {
      throw new Error(`Gmail did not return message metadata for ${args.messageId}.`);
    }
    return {
      messageId: response.data.id,
      threadId: response.data.threadId ?? undefined,
      historyId: response.data.historyId ?? undefined,
      snippet: response.data.snippet ?? undefined,
      internalDate: response.data.internalDate ?? undefined,
      labelIds: response.data.labelIds ?? [],
      headers: this.toHeaderMap(response.data.payload?.headers ?? []),
      attachments: this.collectAttachments(response.data.payload),
    };
  }

  async getAttachmentContent(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    messageId: string;
    attachment: GmailMessageAttachmentRecord;
  }>): Promise<GmailMessageAttachmentContent> {
    void args.mailbox;
    const session = await this.createSession(args.credential);
    const response = await session.gmailClient.users.messages.attachments.get({
      userId: session.userId,
      messageId: args.messageId,
      id: args.attachment.attachmentId,
    });
    const encodedData = response.data.data;
    if (!encodedData) {
      throw new Error(`Gmail did not return attachment content for ${args.attachment.attachmentId} on message ${args.messageId}.`);
    }
    return {
      attachmentId: args.attachment.attachmentId,
      body: this.decodeBase64Url(encodedData),
      mimeType: args.attachment.mimeType,
      filename: args.attachment.filename,
      size: response.data.size ?? args.attachment.size,
    };
  }

  private async createSession(credential: CredentialInput<GmailServiceAccountCredential>): Promise<Readonly<{
    gmailClient: ReturnType<typeof google.gmail>;
    userId: string;
  }>> {
    const resolvedCredential = await resolveCredential(credential, this.credentialService);
    const auth = new google.auth.JWT({
      email: resolvedCredential.clientEmail,
      key: resolvedCredential.privateKey,
      scopes: [GoogleGmailApiClientScopeCatalog.gmailReadonly],
      subject: resolvedCredential.delegatedUser,
    });
    await auth.authorize();
    return {
      gmailClient: google.gmail({
        version: "v1",
        auth,
      }),
      userId: resolvedCredential.delegatedUser,
    };
  }

  private collectMessageIds(history: ReadonlyArray<unknown>): ReadonlyArray<string> {
    const ids = new Set<string>();
    for (const entry of history) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const messagesAdded = (entry as Readonly<{ messagesAdded?: unknown }>).messagesAdded;
      if (!Array.isArray(messagesAdded)) {
        continue;
      }
      for (const messageAdded of messagesAdded) {
        const messageId = this.resolveMessageId(messageAdded);
        if (messageId) {
          ids.add(messageId);
        }
      }
    }
    return [...ids];
  }

  private resolveMessageId(entry: unknown): string | undefined {
    if (!entry || typeof entry !== "object") {
      return undefined;
    }
    const candidate = entry as Readonly<{
      message?: Readonly<{
        id?: string | null;
      }>;
    }>;
    return candidate.message?.id ?? undefined;
  }

  private toHeaderMap(headers: ReadonlyArray<Readonly<{ name?: string | null; value?: string | null }>>): Readonly<Record<string, string>> {
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
        binaryName: this.createAttachmentBinaryName(candidate.filename ?? undefined, attachments.length, naming.valueByName),
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
    const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized.length > 0 ? normalized : "attachment";
  }

  private decodeBase64Url(value: string): Uint8Array {
    const base64Value = value.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(Buffer.from(base64Value, "base64"));
  }

  private isHistoryGap(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const candidate = error as Readonly<{
      code?: number;
      response?: Readonly<{
        status?: number;
      }>;
      message?: string;
    }>;
    return candidate.code === 404 || candidate.response?.status === 404 || candidate.message?.includes("startHistoryId") === true;
  }
}

class GoogleGmailApiClientScopeCatalog {
  static readonly gmailReadonly = "https://www.googleapis.com/auth/gmail.readonly";
}
