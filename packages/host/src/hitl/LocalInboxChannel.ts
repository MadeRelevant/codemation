import { createHash } from "node:crypto";
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
 *
 * Security (T4): The raw resume token is NOT logged. Only the first 8 hex characters of
 * sha256(rawToken) are emitted as a fingerprint to enable log-correlation without leaking
 * the workspace-bound authority token. The local dev inbox UI decides via
 * POST /api/hitl/tasks/:taskId/decide (session-auth), so the token URL is not needed at
 * the log level.
 */
@injectable()
export class LocalInboxChannel implements InboxChannel {
  readonly kind = "local" as const;
  private readonly logger: Logger;

  constructor(@inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory) {
    this.logger = loggerFactory.create("codemation.hitl.local-inbox");
  }

  async deliver(args: InboxDeliverArgs): Promise<InboxDelivery> {
    const tokenFingerprint = createHash("sha256").update(args.task.resumeUrl, "utf8").digest("hex").slice(0, 8);
    this.logger.info(
      `HITL task pending in local inbox — taskId=${args.task.taskId} title="${args.subject.title}" tokenFingerprint=${tokenFingerprint}`,
    );
    return { kind: "local", inboxItemId: args.task.taskId };
  }
}
