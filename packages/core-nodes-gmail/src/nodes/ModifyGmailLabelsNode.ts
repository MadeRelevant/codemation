import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { inject, node } from "@codemation/core";
import { GmailModifyLabelsService } from "../services/GmailModifyLabelsService";
import type { ModifyGmailLabels, ModifyGmailLabelsOutputJson } from "./ModifyGmailLabels";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class ModifyGmailLabelsNode implements RunnableNode<ModifyGmailLabels, unknown, ModifyGmailLabelsOutputJson> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(@inject(GmailModifyLabelsService) private readonly gmailModifyLabelsService: GmailModifyLabelsService) {}

  async execute(args: RunnableNodeExecuteArgs<ModifyGmailLabels, unknown>): Promise<Item> {
    return {
      json: await this.gmailModifyLabelsService.modify(args.ctx),
    };
  }
}
