import type { Items,WebhookControlSignal } from "@codemation/core";

export class WebhookRespondNowError extends Error implements WebhookControlSignal {
  readonly __webhookControl = true as const;
  readonly kind = "respondNow" as const;

  constructor(public readonly responseItems: Items, message: string = "Webhook responded immediately.") {
    super(message);
    this.name = "WebhookRespondNowError";
  }
}
