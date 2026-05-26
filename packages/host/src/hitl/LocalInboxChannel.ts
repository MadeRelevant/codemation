import { inject, injectable } from "@codemation/core";
import type { InboxChannel, InboxDeliverArgs, InboxDelivery } from "@codemation/core";
import { ServerLoggerFactory } from "../infrastructure/logging/ServerLoggerFactory";
import type { Logger } from "../application/logging/Logger";

/**
 * Local inbox channel for non-managed (dev) mode.
 *
 * `deliver` logs the pending task so developers without the UI can see the
 * taskId / resumeUrl in the console, then returns an `InboxDelivery` where
 * `inboxItemId === task.taskId`. The local channel has no separate inbox
 * concept — the dev inbox UI queries `HumanTaskStore.findAllPending()` directly.
 */
@injectable()
export class LocalInboxChannel implements InboxChannel {
  readonly kind = "local" as const;
  private readonly logger: Logger;

  constructor(@inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory) {
    this.logger = loggerFactory.create("codemation.hitl.local-inbox");
  }

  async deliver(args: InboxDeliverArgs): Promise<InboxDelivery> {
    this.logger.info(
      `HITL task pending in local inbox — taskId=${args.task.taskId} title="${args.subject.title}" resumeUrl=${args.task.resumeUrl}`,
    );
    return { kind: "local", inboxItemId: args.task.taskId };
  }
}
