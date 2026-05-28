import { inject, injectable } from "@codemation/core";
import type {
  InboxChannel,
  InboxDeliverArgs,
  InboxDelivery,
  InboxOnDecisionArgs,
  InboxOnTimeoutArgs,
} from "@codemation/core";
import type { Logger } from "../application/logging/Logger";
import { PairedFetch } from "../pairing/PairedFetch";
import type { PairingConfig } from "../pairing/pairing.types";
import { PairingConfigToken } from "../pairing/PairingConfigToken";
import { ServerLoggerFactory } from "../infrastructure/logging/ServerLoggerFactory";

/**
 * Inbox channel that pushes pending HITL tasks to the control plane via HMAC-signed HTTP.
 *
 * Registered only when `PairingConfig` is present (managed mode).
 * The control plane stores the task in its own DB and renders the reviewer inbox.
 * Decisions flow back to the framework via `POST /internal/hitl/tasks/:taskId/callback`.
 */
@injectable()
export class ControlPlaneInboxChannel implements InboxChannel {
  readonly kind = "control-plane-inbox" as const;

  private readonly logger: Logger;

  constructor(
    @inject(PairedFetch) private readonly pairedFetch: PairedFetch,
    @inject(PairingConfigToken) private readonly pairingConfig: PairingConfig,
    @inject(ServerLoggerFactory) loggerFactory: ServerLoggerFactory,
  ) {
    this.logger = loggerFactory.create("codemation.hitl.cp-inbox");
  }

  async deliver(args: InboxDeliverArgs): Promise<InboxDelivery> {
    const { task, subject, priority, item } = args;

    const body = {
      taskId: task.taskId,
      workspaceId: this.pairingConfig.workspaceId,
      runId: task.runId,
      nodeId: task.nodeId,
      subject,
      priority,
      expiresAt: task.expiresAt.toISOString(),
      resumeUrl: task.resumeUrl,
      item: { json: item.json, hasBinary: item.binary != null },
      agentReasoning: task.metadata?.agentReasoning as string | undefined,
    };

    const url = `${this.pairingConfig.controlPlaneUrl}/internal/hitl/tasks`;
    const res = await this.pairedFetch.post(url, body);

    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      throw new Error(`ControlPlaneInboxChannel: CP push failed with status ${res.status}: ${text}`);
    }

    const json = (await res.json()) as { inboxItemId: string };
    this.logger.info(`HITL task delivered to CP inbox — taskId=${task.taskId} inboxItemId=${json.inboxItemId}`);

    return { kind: "cp", inboxItemId: json.inboxItemId, workspaceId: this.pairingConfig.workspaceId };
  }

  async updateOnDecision(args: InboxOnDecisionArgs): Promise<void> {
    if (args.delivery.kind !== "cp") return;

    const url = `${this.pairingConfig.controlPlaneUrl}/internal/hitl/tasks/${args.delivery.inboxItemId}/resolved`;
    const body = {
      decision: args.decision,
      actor: args.actor,
      resolvedAt: new Date().toISOString(),
    };

    const res = await this.pairedFetch.post(url, body);
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      this.logger.warn(
        `Failed to notify CP of task decision — inboxItemId=${args.delivery.inboxItemId} status=${res.status} body=${text}`,
      );
    }
  }

  async updateOnTimeout(args: InboxOnTimeoutArgs): Promise<void> {
    if (args.delivery.kind !== "cp") return;

    const url = `${this.pairingConfig.controlPlaneUrl}/internal/hitl/tasks/${args.delivery.inboxItemId}/resolved`;
    const body = {
      decision: { kind: "timeout", policy: args.policy },
      resolvedAt: new Date().toISOString(),
    };

    const res = await this.pairedFetch.post(url, body);
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      this.logger.warn(
        `Failed to notify CP of task timeout — inboxItemId=${args.delivery.inboxItemId} status=${res.status} body=${text}`,
      );
    }
  }
}
