import type {
  TelemetryArtifactAttachment,
  JsonValue,
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TestableTriggerNode,
  TriggerSetupContext,
  TriggerTestItemsContext,
} from "@codemation/core";
import { CodemationTelemetryMetricNames, inject, node } from "@codemation/core";
import { GoogleGmailApiClientFactory } from "../adapters/google/GoogleGmailApiClientFactory";
import type { GmailLogger } from "../contracts/GmailLogger";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailSession } from "../contracts/GmailSession";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import { GmailPollingTriggerRuntime } from "../runtime/GmailPollingTriggerRuntime";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";
import { OnNewGmailTrigger, type OnNewGmailTriggerItemJson } from "./OnNewGmailTrigger";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class OnNewGmailTriggerNode implements TestableTriggerNode<OnNewGmailTrigger> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  constructor(
    @inject(GmailPollingTriggerRuntime) private readonly gmailPollingTriggerRuntime: GmailPollingTriggerRuntime,
    @inject(GoogleGmailApiClientFactory)
    private readonly googleGmailApiClientFactory: GoogleGmailApiClientFactory,
    @inject(GmailTriggerAttachmentService)
    private readonly gmailTriggerAttachmentService: GmailTriggerAttachmentService,
    @inject(GmailTriggerTestItemService) private readonly gmailTriggerTestItemService: GmailTriggerTestItemService,
    @inject(GmailNodeTokens.TriggerLogger) private readonly logger: GmailLogger,
  ) {}

  async setup(
    ctx: TriggerSetupContext<OnNewGmailTrigger, GmailTriggerSetupState | undefined>,
  ): Promise<GmailTriggerSetupState | undefined> {
    if (!ctx.config.hasRequiredConfiguration()) {
      const missingFields = ctx.config.resolveMissingConfigurationFields();
      this.logger.warn(
        `Gmail trigger skipped (${ctx.trigger.workflowId}.${ctx.trigger.nodeId}): missing ${missingFields.join(", ")}`,
      );
      return ctx.previousState;
    }
    this.logger.info(
      `Gmail trigger setup starting: ${ctx.trigger.workflowId}.${ctx.trigger.nodeId} (mailbox "${ctx.config.cfg.mailbox}")`,
    );
    ctx.registerCleanup({
      stop: async () => {
        await this.gmailPollingTriggerRuntime.stop(ctx.trigger);
      },
    });
    const session = await ctx.getCredential<GmailSession>("auth");
    const client = this.googleGmailApiClientFactory.create(session);
    const setupState = await this.gmailPollingTriggerRuntime.ensureStarted({
      trigger: ctx.trigger,
      client,
      config: ctx.config,
      previousState: ctx.previousState,
      emit: async (items) => {
        await ctx.emit(items);
      },
    });
    if (setupState) {
      this.logger.info(
        `Gmail trigger ready: ${ctx.trigger.workflowId}.${ctx.trigger.nodeId} (${setupState.processedMessageIds.length} message id(s) in dedupe window; baseline ${setupState.baselineComplete ? "done" : "pending"})`,
      );
    } else {
      this.logger.debug(
        `Gmail trigger inactive: ${ctx.trigger.workflowId}.${ctx.trigger.nodeId} (no runtime state; see codemation-gmail.runtime warnings if this was unexpected)`,
      );
    }
    return setupState;
  }

  async getTestItems(
    ctx: TriggerTestItemsContext<OnNewGmailTrigger, GmailTriggerSetupState | undefined>,
  ): Promise<Items> {
    const session = await ctx.getCredential<GmailSession>("auth");
    const client = this.googleGmailApiClientFactory.create(session);
    const items = await this.gmailTriggerTestItemService.createItems({
      trigger: ctx.trigger,
      client,
      config: ctx.config,
      previousState: ctx.previousState,
    });
    this.logger.info(`created ${items.length} Gmail test item(s) for trigger ${ctx.workflowId}.${ctx.nodeId}`);
    return items;
  }

  async execute(
    items: Items<OnNewGmailTriggerItemJson>,
    ctx: NodeExecutionContext<OnNewGmailTrigger>,
  ): Promise<NodeOutputs> {
    if (items.length === 0) {
      this.logger.warn(`manual execution attempted for trigger ${ctx.workflowId}.${ctx.nodeId} without Gmail items`);
      throw new Error(
        `Gmail trigger "${ctx.config.name}" cannot be run manually without a pulled Gmail event. Check the boot logs for setup errors, credential problems, or missing Gmail configuration.`,
      );
    }
    const outputItems = await this.gmailTriggerAttachmentService.attachForItems(items, ctx);
    await ctx.telemetry.recordMetric({
      name: CodemationTelemetryMetricNames.gmailMessagesEmitted,
      value: items.length,
    });
    const attachmentCount = this.countAttachments(items);
    await ctx.telemetry.recordMetric({
      name: CodemationTelemetryMetricNames.gmailAttachments,
      value: attachmentCount,
    });
    await ctx.telemetry.recordMetric({
      name: CodemationTelemetryMetricNames.gmailAttachmentBytes,
      value: this.countAttachmentBytes(items),
      unit: "By",
    });
    await ctx.telemetry.attachArtifact(this.createMessagePreviewArtifact(items));
    return {
      main: outputItems,
    };
  }

  private countAttachments(items: Items<OnNewGmailTriggerItemJson>): number {
    return items.reduce((sum, item) => sum + item.json.attachments.length, 0);
  }

  private countAttachmentBytes(items: Items<OnNewGmailTriggerItemJson>): number {
    return items.reduce(
      (sum, item) =>
        sum + item.json.attachments.reduce((attachmentSum, attachment) => attachmentSum + (attachment.size ?? 0), 0),
      0,
    );
  }

  private createMessagePreviewArtifact(items: Items<OnNewGmailTriggerItemJson>): TelemetryArtifactAttachment {
    return {
      kind: "gmail.messages",
      contentType: "application/json",
      previewJson: items.map((item) => this.toMessagePreview(item.json)),
    };
  }

  private toMessagePreview(item: OnNewGmailTriggerItemJson): JsonValue {
    return {
      mailbox: item.mailbox,
      messageId: item.messageId,
      subject: item.subject ?? null,
      from: item.from ?? null,
      snippet: item.snippet ?? null,
      attachmentCount: item.attachments.length,
      attachmentBytes: item.attachments.reduce((sum, attachment) => sum + (attachment.size ?? 0), 0),
      labelIds: [...item.labelIds],
    } satisfies JsonValue;
  }
}
