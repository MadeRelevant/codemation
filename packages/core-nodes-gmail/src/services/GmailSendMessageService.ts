import type { Item, NodeExecutionContext } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { GoogleGmailApiClientFactory } from "../adapters/google/GoogleGmailApiClientFactory";
import type { GmailSession } from "../contracts/GmailSession";
import type { GmailMessageRecord, GmailOutgoingMessageAttachment } from "./GmailApiClient";
import type {
  GmailOutgoingAttachmentInputJson,
  SendGmailMessage,
  SendGmailMessageInputJson,
} from "../nodes/SendGmailMessage";
import { BinaryStreamCollector } from "./BinaryStreamCollector";

export type GmailSendMessageServiceArgs = Readonly<{
  input: SendGmailMessageInputJson;
  item: Item;
  ctx: NodeExecutionContext<SendGmailMessage>;
}>;

@injectable()
export class GmailSendMessageService {
  constructor(
    @inject(GoogleGmailApiClientFactory)
    private readonly googleGmailApiClientFactory: GoogleGmailApiClientFactory,
    @inject(BinaryStreamCollector)
    private readonly binaryStreamCollector: BinaryStreamCollector,
  ) {}

  async send(args: GmailSendMessageServiceArgs): Promise<GmailMessageRecord> {
    const session = await args.ctx.getCredential<GmailSession>("auth");
    const client = this.googleGmailApiClientFactory.create(session);
    return await client.sendMessage({
      to: this.resolveStringList(args.input.to),
      subject: args.input.subject.trim(),
      text: this.resolveOptionalString(args.input.text),
      html: this.resolveOptionalString(args.input.html),
      cc: this.resolveOptionalStrings(args.input.cc),
      bcc: this.resolveOptionalStrings(args.input.bcc),
      replyTo: this.resolveOptionalString(args.input.replyTo),
      from: this.resolveOptionalString(args.input.from),
      headers: this.resolveHeaders(args.input.headers),
      attachments: await this.resolveAttachments(args),
    });
  }

  private resolveOptionalString(value: string | undefined): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private resolveOptionalStrings(value: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> | undefined {
    const resolved = this.resolveStringList(value);
    return resolved.length > 0 ? resolved : undefined;
  }

  private resolveStringList(value: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> {
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

  private resolveHeaders(
    value: Readonly<Record<string, string>> | undefined,
  ): Readonly<Record<string, string>> | undefined {
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

  private async resolveAttachments(
    args: GmailSendMessageServiceArgs,
  ): Promise<ReadonlyArray<GmailOutgoingMessageAttachment> | undefined> {
    if (!args.input.attachments || args.input.attachments.length === 0) {
      return undefined;
    }
    const attachments: GmailOutgoingMessageAttachment[] = [];
    for (const [index, attachment] of args.input.attachments.entries()) {
      attachments.push(await this.resolveAttachment(args, attachment, index));
    }
    return attachments;
  }

  private async resolveAttachment(
    args: GmailSendMessageServiceArgs,
    attachment: GmailOutgoingAttachmentInputJson,
    index: number,
  ): Promise<GmailOutgoingMessageAttachment> {
    const binaryAttachment = args.item.binary?.[attachment.binaryName];
    if (!binaryAttachment) {
      throw new Error(
        `SendGmailMessage attachments[${index}].binaryName "${attachment.binaryName}" was not found on item.binary.`,
      );
    }
    const binary = await args.ctx.binary.openReadStream(binaryAttachment);
    if (!binary) {
      throw new Error(
        `SendGmailMessage attachments[${index}].binaryName "${attachment.binaryName}" could not be opened from binary storage.`,
      );
    }
    return {
      filename: attachment.filename?.trim() || binaryAttachment.filename || attachment.binaryName,
      mimeType: attachment.mimeType?.trim() || binaryAttachment.mimeType,
      body: await this.binaryStreamCollector.collect(binary.body),
      contentId: this.resolveOptionalString(attachment.contentId),
      contentTransferEncoding: attachment.contentTransferEncoding,
      disposition: attachment.disposition,
    };
  }
}
