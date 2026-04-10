import type { Item, RunnableNode, RunnableNodeExecuteArgs, WorkflowExecutionRepository } from "@codemation/core";
import { CoreTokens, inject, node } from "@codemation/core";
import { OdooService } from "../services/odooService";
import type { KitchenSinkExample } from "./kitchenSinkExample";

@node()
export class KitchenSinkExampleNode implements RunnableNode<KitchenSinkExample> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  constructor(
    @inject(CoreTokens.WorkflowExecutionRepository)
    private readonly runStore: WorkflowExecutionRepository,
    @inject(OdooService)
    private readonly odooService: OdooService,
  ) {}

  async execute(args: RunnableNodeExecuteArgs<KitchenSinkExample>): Promise<unknown> {
    const persistedRun = await this.runStore.load(args.ctx.runId);
    const item = args.item as Item;
    const json = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
    const customerName = String(json[args.ctx.config.cfg.customerNameField] ?? "");
    const quotationDraft = this.odooService.createQuotationDraft(customerName);

    return {
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
    };
  }
}
