import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { inject, node } from "@codemation/core";
import { GmailSendMessageService } from "../services/GmailSendMessageService";
import type { SendGmailMessage, SendGmailMessageOutputJson } from "./SendGmailMessage";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class SendGmailMessageNode implements RunnableNode<SendGmailMessage, unknown, SendGmailMessageOutputJson> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(@inject(GmailSendMessageService) private readonly gmailSendMessageService: GmailSendMessageService) {}

  async execute(args: RunnableNodeExecuteArgs<SendGmailMessage, unknown>): Promise<Item> {
    return {
      json: await this.gmailSendMessageService.send(args.ctx),
    };
  }
}
