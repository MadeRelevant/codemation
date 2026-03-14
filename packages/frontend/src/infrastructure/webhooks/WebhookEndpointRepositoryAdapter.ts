import { inject, injectable } from "@codemation/core";
import { CodemationWebhookRegistry } from "./CodemationWebhookRegistry";
import type { WebhookEndpointDefinition } from "../../domain/webhooks/WebhookEndpointRepository";
import { WebhookEndpointRepository } from "../../domain/webhooks/WebhookEndpointRepository";

@injectable()
export class WebhookEndpointRepositoryAdapter implements WebhookEndpointRepository {
  constructor(
    @inject(CodemationWebhookRegistry)
    private readonly webhookRegistry: CodemationWebhookRegistry,
  ) {}

  async register(endpoint: WebhookEndpointDefinition): Promise<void> {
    this.webhookRegistry.register(endpoint);
  }

  async get(endpointId: string): Promise<WebhookEndpointDefinition | undefined> {
    return this.webhookRegistry.get(endpointId) as WebhookEndpointDefinition | undefined;
  }
}
