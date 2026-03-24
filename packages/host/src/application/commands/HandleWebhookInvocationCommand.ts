import type { Item } from "@codemation/core";
import { Command } from "../bus/Command";

export class HandleWebhookInvocationCommand extends Command<unknown> {
  constructor(
    public readonly endpointPath: string,
    public readonly requestMethod: string,
    public readonly requestItem: Item,
  ) {
    super();
  }
}
