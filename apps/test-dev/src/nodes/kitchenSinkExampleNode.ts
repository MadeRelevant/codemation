import type { Item,Items,Node,NodeExecutionContext,NodeOutputs,RunStateStore } from "@codemation/core";
import { CoreTokens,inject,node } from "@codemation/core";
import { OdooService } from "../services/odooService";
import type { KitchenSinkExample } from "./kitchenSinkExample";

@node()
export class KitchenSinkExampleNode implements Node<KitchenSinkExample> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  constructor(
    @inject(CoreTokens.RunStateStore)
    private readonly runStore: RunStateStore,
    @inject(OdooService)
    private readonly odooService: OdooService,
  ) {}

  async execute(items: Items, ctx: NodeExecutionContext<KitchenSinkExample>): Promise<NodeOutputs> {
    const persistedRun = await this.runStore.load(ctx.runId);
    const out: Item[] = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      const json = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
      const customerName = String(json[ctx.config.cfg.customerNameField] ?? "");
      const quotationDraft = this.odooService.createQuotationDraft(customerName);

      out.push({
        ...item,
        json: {
          ...json,
          kitchenSink: {
            frameworkRunLoaded: persistedRun !== undefined,
            quotationReference: quotationDraft.quotationReference,
            odooBaseUrl: quotationDraft.baseUrl,
            customerName: quotationDraft.partnerName,
          },
        },
      });
    }

    return { main: out };
  }
}
