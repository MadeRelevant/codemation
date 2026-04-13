import type { NodeExecutionContext } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { GoogleGmailApiClientFactory } from "../adapters/google/GoogleGmailApiClientFactory";
import type { GmailSession } from "../contracts/GmailSession";
import type { GmailMessageRecord, GmailOutgoingMessageAttachment } from "./GmailApiClient";
import type { SendGmailMessage } from "../nodes/SendGmailMessage";

@injectable()
export class GmailSendMessageService {
  constructor(
    @inject(GoogleGmailApiClientFactory)
    private readonly googleGmailApiClientFactory: GoogleGmailApiClientFactory,
  ) {}

  async send(ctx: NodeExecutionContext<SendGmailMessage>): Promise<GmailMessageRecord> {
    const session = await ctx.getCredential<GmailSession>("auth");
    const client = this.googleGmailApiClientFactory.create(session);
    return await client.sendMessage({
      to: this.resolveRequiredStrings(ctx.config.cfg.to, "cfg.to"),
      subject: this.resolveRequiredString(ctx.config.cfg.subject, "cfg.subject"),
      text: this.resolveOptionalString(ctx.config.cfg.text),
      html: this.resolveOptionalString(ctx.config.cfg.html),
      cc: this.resolveOptionalStrings(ctx.config.cfg.cc),
      bcc: this.resolveOptionalStrings(ctx.config.cfg.bcc),
      replyTo: this.resolveOptionalString(ctx.config.cfg.replyTo),
      from: this.resolveOptionalString(ctx.config.cfg.from),
      headers: this.resolveHeaders(ctx.config.cfg.headers),
      attachments: this.resolveAttachments(ctx.config.cfg.attachments),
    });
  }

  private resolveRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`SendGmailMessage expected input.${fieldName} to be a non-empty string.`);
    }
    return value.trim();
  }

  private resolveOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private resolveRequiredStrings(value: unknown, fieldName: string): ReadonlyArray<string> {
    const resolved = this.resolveStringList(value);
    if (resolved.length === 0) {
      throw new Error(`SendGmailMessage expected input.${fieldName} to contain at least one recipient.`);
    }
    return resolved;
  }

  private resolveOptionalStrings(value: unknown): ReadonlyArray<string> | undefined {
    const resolved = this.resolveStringList(value);
    return resolved.length > 0 ? resolved : undefined;
  }

  private resolveStringList(value: unknown): ReadonlyArray<string> {
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }
    if (Array.isArray(value)) {
      return value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }
    return [];
  }

  private resolveHeaders(value: unknown): Readonly<Record<string, string>> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const headers: Record<string, string> = {};
    for (const [key, headerValue] of Object.entries(value)) {
      if (typeof headerValue !== "string") {
        continue;
      }
      const normalizedKey = key.trim();
      const normalizedValue = headerValue.trim();
      if (!normalizedKey || !normalizedValue) {
        continue;
      }
      headers[normalizedKey] = normalizedValue;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private resolveAttachments(value: unknown): ReadonlyArray<GmailOutgoingMessageAttachment> | undefined {
    if (!Array.isArray(value) || value.length === 0) {
      return undefined;
    }
    const attachments = value
      .map((entry) => this.resolveAttachment(entry))
      .filter((entry): entry is GmailOutgoingMessageAttachment => entry !== undefined);
    return attachments.length > 0 ? attachments : undefined;
  }

  private resolveAttachment(value: unknown): GmailOutgoingMessageAttachment | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const candidate = value as Readonly<Record<string, unknown>>;
    if (
      typeof candidate["filename"] !== "string" ||
      candidate["filename"].trim().length === 0 ||
      typeof candidate["mimeType"] !== "string" ||
      candidate["mimeType"].trim().length === 0
    ) {
      return undefined;
    }
    const body = candidate["body"];
    if (!(typeof body === "string" || body instanceof Uint8Array)) {
      return undefined;
    }
    return {
      filename: candidate["filename"].trim(),
      mimeType: candidate["mimeType"].trim(),
      body,
      contentId: this.resolveOptionalString(candidate["contentId"]),
      contentTransferEncoding: this.resolveTransferEncoding(candidate["contentTransferEncoding"]),
      disposition: this.resolveDisposition(candidate["disposition"]),
    };
  }

  private resolveTransferEncoding(
    value: unknown,
  ): GmailOutgoingMessageAttachment["contentTransferEncoding"] | undefined {
    if (
      value === "base64" ||
      value === "quoted-printable" ||
      value === "7bit" ||
      value === "8bit" ||
      value === "binary"
    ) {
      return value;
    }
    return undefined;
  }

  private resolveDisposition(value: unknown): GmailOutgoingMessageAttachment["disposition"] | undefined {
    if (value === "attachment" || value === "inline") {
      return value;
    }
    return undefined;
  }
}
