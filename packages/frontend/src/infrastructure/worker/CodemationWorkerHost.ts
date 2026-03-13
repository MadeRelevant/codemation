import type { NodeActivationObserver, NodeActivationStats, WebhookRegistrar } from "@codemation/core";
import { injectable } from "@codemation/core";

@injectable()
export class CodemationWorkerHost implements WebhookRegistrar, NodeActivationObserver {
  registerWebhook(): never {
    throw new Error("WorkerHost.registerWebhook is not supported in worker mode");
  }

  onNodeActivation(_stats: NodeActivationStats): void {}
}
