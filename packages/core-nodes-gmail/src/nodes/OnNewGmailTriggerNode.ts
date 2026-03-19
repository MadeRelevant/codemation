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
import { GmailPullTriggerRuntime } from "../runtime/GmailPullTriggerRuntime";
import type { GmailApiClient } from "../services/GmailApiClient";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";
import { OnNewGmailTrigger, type OnNewGmailTriggerItemJson } from "./OnNewGmailTrigger";

@node({ packageName: "@codemation/core-nodes-gmail" })
export class OnNewGmailTriggerNode implements TestableTriggerNode<OnNewGmailTrigger> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  constructor(
    @inject(GmailPullTriggerRuntime) private readonly gmailPullTriggerRuntime: GmailPullTriggerRuntime,
    @inject(GmailTriggerAttachmentService) private readonly gmailTriggerAttachmentService: GmailTriggerAttachmentService,
    @inject(GmailTriggerTestItemService) private readonly gmailTriggerTestItemService: GmailTriggerTestItemService,
    @inject(GmailNodeTokens.TriggerLogger) private readonly logger: GmailLogger,
  ) {}

  async setup(
    ctx: TriggerSetupContext<OnNewGmailTrigger, GmailTriggerSetupState | undefined>,
  ): Promise<GmailTriggerSetupState | undefined> {
    this.logger.info(
      `setup starting for trigger ${ctx.trigger.workflowId}.${ctx.trigger.nodeId} on mailbox "${ctx.config.cfg.mailbox || "<unset>"}"`,
    );
    ctx.registerCleanup({
      stop: async () => {
        await this.gmailPullTriggerRuntime.stop(ctx.trigger);
      },
    });
    const client = await ctx.getCredential<GmailApiClient>("auth");
    const setupState = await this.gmailPullTriggerRuntime.ensureStarted({
      trigger: ctx.trigger,
      client,
      config: ctx.config,
      previousState: ctx.previousState,
      emit: async (items) => {
        await ctx.emit(items);
      },
    });
    this.logger.info(
      `setup finished for trigger ${ctx.trigger.workflowId}.${ctx.trigger.nodeId}${setupState ? ` with history ${setupState.historyId}` : " without active runtime state"}`,
    );
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
    this.logger.info(
      `created ${items.length} Gmail test item(s) for trigger ${ctx.workflowId}.${ctx.nodeId}`,
    );
    return items;
  }

  async execute(items: Items<OnNewGmailTriggerItemJson>, _ctx: NodeExecutionContext<OnNewGmailTrigger>): Promise<NodeOutputs> {
    if (items.length === 0) {
      this.logger.warn(
        `manual execution attempted for trigger ${_ctx.workflowId}.${_ctx.nodeId} without Gmail items`,
      );
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
