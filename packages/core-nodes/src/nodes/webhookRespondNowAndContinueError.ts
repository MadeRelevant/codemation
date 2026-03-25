import type { Items, WebhookControlSignal } from "@codemation/core";

export class WebhookRespondNowAndContinueError extends Error implements WebhookControlSignal {
  readonly __webhookControl = true as const;
  readonly kind = "respondNowAndContinue" as const;

  constructor(
    public readonly responseItems: Items,
    public readonly continueItems: Items,
    message: string = "Webhook responded immediately and continued the run.",
  ) {
    super(message);
    this.name = "WebhookRespondNowAndContinueError";
  }
}
