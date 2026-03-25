import { google } from "googleapis";

import type { GmailOAuthCredential } from "../../contracts/GmailOAuthCredential";

import type { GmailServiceAccountCredential } from "../../contracts/GmailServiceAccountCredential";

import type {
  GmailApiClient,
  GmailMessageAttachmentContent,
  GmailMessageAttachmentRecord,
  GmailMessageRecord,
} from "../../services/GmailApiClient";

import { GmailMessagePayloadTextExtractor } from "./GmailMessagePayloadTextExtractor";
import { GoogleGmailApiClientScopeCatalog } from "./GoogleGmailApiClientScopeCatalog";

type GmailGoogleCredential = GmailServiceAccountCredential | GmailOAuthCredential;

export class GoogleGmailApiClient implements GmailApiClient {
  private readonly messagePayloadTextExtractor = new GmailMessagePayloadTextExtractor();

  constructor(private readonly credential: GmailGoogleCredential) {}

  async getCurrentHistoryId(args: Readonly<{ mailbox: string }>): Promise<string> {
    void args.mailbox;
    const session = await this.createSession();
    const response = await session.gmailClient.users.getProfile({
      userId: session.userId,
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
    void args.mailbox;
    const session = await this.createSession();
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

  async listLabels(args: Readonly<{ mailbox: string }>): Promise<
    ReadonlyArray<{
      id: string;
      name: string;
      type?: string;
    }>
  > {
    void args.mailbox;
    const session = await this.createSession();
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

  async getMessage(
    args: Readonly<{
      mailbox: string;
      messageId: string;
    }>,
  ): Promise<GmailMessageRecord> {
    void args.mailbox;
    const session = await this.createSession();
    const response = await session.gmailClient.users.messages.get({
      userId: session.userId,
      id: args.messageId,
      format: "full",
    });
    if (!response.data.id) {
      throw new Error(`Gmail did not return message metadata for ${args.messageId}.`);
    }
    const bodies = this.messagePayloadTextExtractor.extract(response.data.payload);
    return {
      messageId: response.data.id,
      threadId: response.data.threadId ?? undefined,
      historyId: response.data.historyId ?? undefined,
      snippet: response.data.snippet ?? undefined,
      internalDate: response.data.internalDate ?? undefined,
      labelIds: response.data.labelIds ?? [],
      headers: this.toHeaderMap(response.data.payload?.headers ?? []),
      textPlain: bodies.textPlain,
      textHtml: bodies.textHtml,
      attachments: this.collectAttachments(response.data.payload),
    };
  }

  async getAttachmentContent(
    args: Readonly<{
      mailbox: string;
      messageId: string;
      attachment: GmailMessageAttachmentRecord;
    }>,
  ): Promise<GmailMessageAttachmentContent> {
    void args.mailbox;
    const session = await this.createSession();
    const response = await session.gmailClient.users.messages.attachments.get({
      userId: session.userId,
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

  private async createSession(): Promise<
    Readonly<{
      gmailClient: ReturnType<typeof google.gmail>;
      userId: string;
    }>
  > {
    if (this.isServiceAccountCredential(this.credential)) {
      const auth = new google.auth.JWT({
        email: this.credential.clientEmail,
        key: this.credential.privateKey,
        scopes: [GoogleGmailApiClientScopeCatalog.gmailReadonly],
        subject: this.credential.delegatedUser,
      });
      await auth.authorize();
      return {
        gmailClient: google.gmail({
          version: "v1",
          auth,
        }),
        userId: this.credential.delegatedUser,
      };
    }
    const auth = new google.auth.OAuth2(this.credential.clientId, this.credential.clientSecret);
    auth.setCredentials({
      access_token: this.credential.accessToken,
      refresh_token: this.credential.refreshToken,
      expiry_date: this.credential.expiry ? new Date(this.credential.expiry).getTime() : undefined,
    });
    return {
      gmailClient: google.gmail({
        version: "v1",
        auth,
      }),
      userId: "me",
    };
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

  private isServiceAccountCredential(credential: GmailGoogleCredential): credential is GmailServiceAccountCredential {
    return "clientEmail" in credential;
  }
}

export { GoogleGmailApiClientScopeCatalog } from "./GoogleGmailApiClientScopeCatalog";
