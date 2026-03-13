import type { RunEventBus, RunEventSubscription } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowWebsocketPublisher } from "./WorkflowWebsocketPublisher";

@injectable()
export class WorkflowRunEventWebsocketRelay {
  private subscription: RunEventSubscription | null = null;

  constructor(
    @inject(ApplicationTokens.WorkflowWebsocketPublisher)
    private readonly workflowWebsocketPublisher: WorkflowWebsocketPublisher,
    private readonly runEventBus: RunEventBus,
  ) {}

  async start(): Promise<void> {
    if (this.subscription) {
      return;
    }
    this.subscription = await this.runEventBus.subscribe(async (event) => {
      await this.workflowWebsocketPublisher.publishToRoom(event.workflowId, {
        kind: "event",
        event,
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.subscription) {
      return;
    }
    await this.subscription.close();
    this.subscription = null;
  }
}
