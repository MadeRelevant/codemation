import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { inject, node } from "@codemation/core";
import { GmailReplyToMessageService } from "../services/GmailReplyToMessageService";
import type { ReplyToGmailMessage, ReplyToGmailMessageOutputJson } from "./ReplyToGmailMessage";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class ReplyToGmailMessageNode implements RunnableNode<
  ReplyToGmailMessage,
  unknown,
  ReplyToGmailMessageOutputJson
> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(
    @inject(GmailReplyToMessageService) private readonly gmailReplyToMessageService: GmailReplyToMessageService,
  ) {}

  async execute(args: RunnableNodeExecuteArgs<ReplyToGmailMessage, unknown>): Promise<Item> {
    return {
      json: await this.gmailReplyToMessageService.reply(args.ctx),
    };
  }
}
