import type { Item, Items, NodeExecutionContext } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { GoogleGmailApiClientFactory } from "../adapters/google/GoogleGmailApiClientFactory";
import type { GmailSession } from "../contracts/GmailSession";
import type { OnNewGmailTrigger, OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import type { GmailMessageAttachmentRecord } from "./GmailApiClient";

@injectable()
export class GmailTriggerAttachmentService {
  constructor(
    @inject(GoogleGmailApiClientFactory)
    private readonly googleGmailApiClientFactory: GoogleGmailApiClientFactory,
  ) {}

  async attachForItems(
    items: Items<OnNewGmailTriggerItemJson>,
    ctx: NodeExecutionContext<OnNewGmailTrigger>,
  ): Promise<Items<OnNewGmailTriggerItemJson>> {
    if (!ctx.config.cfg.downloadAttachments) {
      return items;
    }
    return await Promise.all(items.map(async (item) => await this.attachForItem(item, ctx)));
  }

  private async attachForItem(
    item: Item<OnNewGmailTriggerItemJson>,
    ctx: NodeExecutionContext<OnNewGmailTrigger>,
  ): Promise<Item<OnNewGmailTriggerItemJson>> {
    let outputItem = item;
    for (const attachment of this.resolveAttachments(item)) {
      outputItem = await this.attachOne(outputItem, attachment, ctx);
    }
    return outputItem;
  }

  private async attachOne(
    item: Item<OnNewGmailTriggerItemJson>,
    attachment: GmailMessageAttachmentRecord,
    ctx: NodeExecutionContext<OnNewGmailTrigger>,
  ): Promise<Item<OnNewGmailTriggerItemJson>> {
    const session = await ctx.getCredential<GmailSession>("auth");
    const client = this.googleGmailApiClientFactory.create(session);
    const content = await client.getAttachmentContent({
      mailbox: ctx.config.cfg.mailbox,
      messageId: item.json.messageId,
      attachment,
    });
    const binaryAttachment = await ctx.binary.attach({
      name: attachment.binaryName,
      body: content.body,
      mimeType: content.mimeType,
      filename: content.filename,
    });
    return ctx.binary.withAttachment(item, attachment.binaryName, binaryAttachment);
  }

  private resolveAttachments(item: Item<OnNewGmailTriggerItemJson>): ReadonlyArray<GmailMessageAttachmentRecord> {
    return Array.isArray(item.json.attachments) ? item.json.attachments : [];
  }
}
