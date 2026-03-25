import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TestableTriggerNode,
  TriggerSetupContext,
  TriggerTestItemsContext,
} from "@codemation/core";
import { inject, node } from "@codemation/core";
import type { GmailLogger } from "../contracts/GmailLogger";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import { GmailPollingTriggerRuntime } from "../runtime/GmailPollingTriggerRuntime";
import type { GmailApiClient } from "../services/GmailApiClient";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";
import { OnNewGmailTrigger, type OnNewGmailTriggerItemJson } from "./OnNewGmailTrigger";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class OnNewGmailTriggerNode implements TestableTriggerNode<OnNewGmailTrigger> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  constructor(
    @inject(GmailPollingTriggerRuntime) private readonly gmailPollingTriggerRuntime: GmailPollingTriggerRuntime,
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
    const client = await ctx.getCredential<GmailApiClient>("auth");
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
    const client = await ctx.getCredential<GmailApiClient>("auth");
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
    _ctx: NodeExecutionContext<OnNewGmailTrigger>,
  ): Promise<NodeOutputs> {
    if (items.length === 0) {
      this.logger.warn(`manual execution attempted for trigger ${_ctx.workflowId}.${_ctx.nodeId} without Gmail items`);
      throw new Error(
        `Gmail trigger "${_ctx.config.name}" cannot be run manually without a pulled Gmail event. Check the boot logs for setup errors, credential problems, or missing Gmail configuration.`,
      );
    }
    const outputItems = await this.gmailTriggerAttachmentService.attachForItems(items, _ctx);
    return {
      main: outputItems,
    };
  }
}
