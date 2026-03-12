import type { HttpMethod, Items, NodeExecutionContext, TriggerNodeConfig, TypeToken } from "@codemation/core";
import type { ZodType } from "zod";
import { WebhookTriggerNode } from "./webhookTriggerNode";

type WebhookInputSchema = ZodType<any, any, any>;
type WebhookTriggerHandler<TConfig extends WebhookTrigger<any> = WebhookTrigger<any>> =
  (items: Items, ctx: NodeExecutionContext<TConfig>) => Promise<Items | void> | Items | void;

export class WebhookTrigger<TSchema extends WebhookInputSchema | undefined = undefined> implements TriggerNodeConfig<unknown> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = WebhookTriggerNode;
  readonly icon = "globe";

  constructor(
    public readonly name: string,
    private readonly args: Readonly<{
      endpointKey: string;
      methods: ReadonlyArray<HttpMethod>;
      inputSchema?: TSchema;
    }>,
    public readonly handler: WebhookTriggerHandler<WebhookTrigger<TSchema>> = WebhookTrigger.defaultHandler as WebhookTriggerHandler<WebhookTrigger<TSchema>>,
    public readonly id?: string,
  ) {}

  get endpointKey(): string {
    return this.args.endpointKey;
  }

  get methods(): ReadonlyArray<HttpMethod> {
    return this.args.methods;
  }

  get inputSchema(): TSchema | undefined {
    return this.args.inputSchema;
  }

  parseJsonBody(body: unknown): unknown {
    if (!this.args.inputSchema) return body;
    return this.args.inputSchema.parse(body);
  }

  private static defaultHandler(items: Items): Items {
    return items;
  }
}
