import type { Items } from "@codemation/core";

export class CodemationWebhookRegistry {
  private readonly handlersByEndpointId = new Map<string, Readonly<{ method: string; handler: (req: unknown) => Promise<Items> }>>();

  register(args: Readonly<{ endpointId: string; method: string; handler: (req: unknown) => Promise<Items> }>): void {
    this.handlersByEndpointId.set(args.endpointId, { method: args.method, handler: args.handler });
  }

  get(endpointId: string): Readonly<{ method: string; handler: (req: unknown) => Promise<Items> }> | undefined {
    return this.handlersByEndpointId.get(endpointId);
  }
}
