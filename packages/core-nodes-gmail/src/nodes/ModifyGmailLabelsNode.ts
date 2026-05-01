import type { Item, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { inject, node } from "@codemation/core";
import { GmailModifyLabelsService } from "../services/GmailModifyLabelsService";
import type { ModifyGmailLabels, ModifyGmailLabelsInputJson, ModifyGmailLabelsOutputJson } from "./ModifyGmailLabels";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class ModifyGmailLabelsNode implements RunnableNode<
  ModifyGmailLabels,
  ModifyGmailLabelsInputJson,
  ModifyGmailLabelsOutputJson
> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(@inject(GmailModifyLabelsService) private readonly gmailModifyLabelsService: GmailModifyLabelsService) {}

  async execute(args: RunnableNodeExecuteArgs<ModifyGmailLabels, ModifyGmailLabelsInputJson>): Promise<Item> {
    return {
      json: await this.gmailModifyLabelsService.modify({
        input: args.input,
        ctx: args.ctx,
      }),
    };
  }
}
