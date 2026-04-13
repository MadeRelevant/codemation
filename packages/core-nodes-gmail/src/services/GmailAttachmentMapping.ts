import type { Item } from "@codemation/core";
import type { OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import type { GmailMessageAttachmentRecord } from "./GmailApiClient";

export type GmailParseNodeAttachment = Readonly<{
  filename: string;
  mimetype: string;
  binaryKey: string;
}>;

export class GmailAttachmentMapping {
  toParseNodeAttachment(attachment: GmailMessageAttachmentRecord): GmailParseNodeAttachment {
    return {
      filename: attachment.filename ?? attachment.binaryName,
      mimetype: attachment.mimeType,
      binaryKey: attachment.binaryName,
    };
  }

  toParseNodeAttachments(item: Pick<Item<OnNewGmailTriggerItemJson>, "json">): ReadonlyArray<GmailParseNodeAttachment> {
    return (item.json.attachments ?? []).map((attachment) => this.toParseNodeAttachment(attachment));
  }
}
