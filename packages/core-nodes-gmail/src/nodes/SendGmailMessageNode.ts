import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { inject, node } from "@codemation/core";
import { GmailSendMessageService } from "../services/GmailSendMessageService";
import type { SendGmailMessage, SendGmailMessageInputJson, SendGmailMessageOutputJson } from "./SendGmailMessage";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class SendGmailMessageNode implements RunnableNode<
  SendGmailMessage,
  SendGmailMessageInputJson,
  SendGmailMessageOutputJson
> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(@inject(GmailSendMessageService) private readonly gmailSendMessageService: GmailSendMessageService) {}

  async execute(args: RunnableNodeExecuteArgs<SendGmailMessage, SendGmailMessageInputJson>): Promise<Item> {
    return {
      json: await this.gmailSendMessageService.send({
        input: args.input,
        item: args.item,
        ctx: args.ctx,
      }),
    };
  }
}
