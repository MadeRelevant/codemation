import type { CredentialInput, CredentialService } from "@codemation/core";
import { CoreTokens, inject, injectable, resolveCredential } from "@codemation/core";
import { google } from "googleapis";
import type { GmailServiceAccountCredential } from "../../contracts/GmailServiceAccountCredential";
import { GmailHistoryGapError, type GmailApiClient, type GmailHistoryDelta, type GmailMessageRecord, type GmailWatchRegistration } from "../../services/GmailApiClient";

@injectable()
export class GoogleGmailApiClient implements GmailApiClient {
  constructor(@inject(CoreTokens.CredentialService) private readonly credentialService: CredentialService) {}

  async getCurrentHistoryId(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
  }>): Promise<string> {
    const gmailClient = await this.createClient(args.credential, args.mailbox);
    const response = await gmailClient.users.getProfile({
      userId: "me",
    });
    if (!response.data.historyId) {
      throw new Error(`Gmail did not return a history id for mailbox ${args.mailbox}.`);
    }
    return response.data.historyId;
  }

  async watchMailbox(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    topicName: string;
    labelIds?: ReadonlyArray<string>;
  }>): Promise<GmailWatchRegistration> {
    const gmailClient = await this.createClient(args.credential, args.mailbox);
    const response = await gmailClient.users.watch({
      userId: "me",
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
    const gmailClient = await this.createClient(args.credential, args.mailbox);
    try {
      const response = await gmailClient.users.history.list({
        userId: "me",
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
    const gmailClient = await this.createClient(args.credential, args.mailbox);
    const response = await gmailClient.users.messages.get({
      userId: "me",
      id: args.messageId,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Delivered-To", "Cc", "Bcc", "Date"],
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
    };
  }

  private async createClient(
    credential: CredentialInput<GmailServiceAccountCredential>,
    mailbox: string,
  ): Promise<ReturnType<typeof google.gmail>> {
    const resolvedCredential = await resolveCredential(credential, this.credentialService);
    const auth = new google.auth.JWT({
      email: resolvedCredential.clientEmail,
      key: resolvedCredential.privateKey,
      scopes: [GoogleGmailApiClientScopeCatalog.gmailReadonly],
      subject: mailbox,
    });
    await auth.authorize();
    return google.gmail({
      version: "v1",
      auth,
    });
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
