import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { inject, node } from "@codemation/core";
import { GmailReplyToMessageService } from "../services/GmailReplyToMessageService";
import type {
  ReplyToGmailMessage,
  ReplyToGmailMessageInputJson,
  ReplyToGmailMessageOutputJson,
} from "./ReplyToGmailMessage";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class ReplyToGmailMessageNode implements RunnableNode<
  ReplyToGmailMessage,
  ReplyToGmailMessageInputJson,
  ReplyToGmailMessageOutputJson
> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(
    @inject(GmailReplyToMessageService) private readonly gmailReplyToMessageService: GmailReplyToMessageService,
  ) {}

  async execute(args: RunnableNodeExecuteArgs<ReplyToGmailMessage, ReplyToGmailMessageInputJson>): Promise<Item> {
    return {
      json: await this.gmailReplyToMessageService.reply({
        input: args.input,
        item: args.item,
        ctx: args.ctx,
      }),
    };
  }
}
