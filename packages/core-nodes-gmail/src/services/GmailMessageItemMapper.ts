import type { Item, Items } from "@codemation/core";
import { injectable } from "@codemation/core";
import type { OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import type { GmailMessageRecord } from "./GmailApiClient";

@injectable()
export class GmailMessageItemMapper {
  mapMany(
    args: Readonly<{
      mailbox: string;
      historyId: string;
      messages: ReadonlyArray<GmailMessageRecord>;
    }>,
  ): Items<OnNewGmailTriggerItemJson> {
    return args.messages.map((message) =>
      this.mapOne({
        mailbox: args.mailbox,
        historyId: args.historyId,
        message,
      }),
    );
  }

  private mapOne(
    args: Readonly<{
      mailbox: string;
      historyId: string;
      message: GmailMessageRecord;
    }>,
  ): Item<OnNewGmailTriggerItemJson> {
    return {
      json: {
        mailbox: args.mailbox,
        historyId: args.historyId,
        messageId: args.message.messageId,
        threadId: args.message.threadId,
        snippet: args.message.snippet,
        internalDate: args.message.internalDate,
        labelIds: args.message.labelIds,
        headers: args.message.headers,
        from: args.message.headers.From,
        to: args.message.headers.To,
        subject: args.message.headers.Subject,
        deliveredTo: args.message.headers["Delivered-To"],
        attachments: args.message.attachments,
      },
    };
  }
}
