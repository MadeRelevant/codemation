import type { Items, TriggerInstanceId, TriggerSetupStateStore } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type { GmailLogger } from "../contracts/GmailLogger";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger } from "../nodes/OnNewGmailTrigger";
import type { GmailApiClient } from "../services/GmailApiClient";
import { GmailHistorySyncService } from "../services/GmailHistorySyncService";
import { GmailTriggerPubSubResourceResolver } from "../services/GmailTriggerPubSubResourceResolver";
import { GmailWatchService } from "../services/GmailWatchService";

@injectable()
export class GmailPullTriggerRuntime {
  private readonly activeTriggers = new Set<string>();
  private readonly pullIntervalsByTrigger = new Map<string, NodeJS.Timeout>();
  private readonly busyTriggers = new Set<string>();

  constructor(
    @inject(GmailNodeTokens.GmailNodesOptions) private readonly options: GmailNodesOptions,
    @inject(CoreTokens.TriggerSetupStateStore) private readonly triggerSetupStateStore: TriggerSetupStateStore,
    @inject(GmailNodeTokens.RuntimeLogger) private readonly logger: GmailLogger,
    @inject(GmailWatchService) private readonly gmailWatchService: GmailWatchService,
    @inject(GmailHistorySyncService) private readonly gmailHistorySyncService: GmailHistorySyncService,
    @inject(GmailTriggerPubSubResourceResolver)
    private readonly gmailTriggerPubSubResourceResolver: GmailTriggerPubSubResourceResolver,
  ) {}

  async ensureStarted(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      previousState: GmailTriggerSetupState | undefined;
      emit(items: Items): Promise<void>;
    }>,
  ): Promise<GmailTriggerSetupState | undefined> {
    if (!args.config.hasRequiredConfiguration()) {
      const missingFields = args.config.resolveMissingConfigurationFields();
      this.logger.warn(
        `Gmail pull trigger skipped (${this.describeTrigger(args.trigger)}): missing ${missingFields.join(", ")}`,
      );
      return args.previousState;
    }
    const resolvedPubSub = this.gmailTriggerPubSubResourceResolver.resolve(
      args.config.cfg,
      args.client.getDefaultGcpProjectIdForPubSub(),
    );
    if (!resolvedPubSub) {
      this.logger.warn(
        `Gmail pull trigger skipped (${this.describeTrigger(args.trigger)}): could not resolve Pub/Sub topic/subscription (set them on the trigger, or GMAIL_TRIGGER_TOPIC_NAME / GMAIL_TRIGGER_SUBSCRIPTION_NAME, or GOOGLE_CLOUD_PROJECT; service accounts use the credential project id).`,
      );
      return args.previousState;
    }
    const effectiveConfig = await this.cloneTriggerWithResolvedPubSub(args.config, resolvedPubSub);
    const nextState = await this.gmailWatchService.ensureSetupState({
      trigger: args.trigger,
      client: args.client,
      mailbox: effectiveConfig.cfg.mailbox,
      topicName: resolvedPubSub.topicName,
      subscriptionName: resolvedPubSub.subscriptionName,
      labelIds: effectiveConfig.cfg.labelIds,
      previousState: args.previousState,
      persist: false,
    });
    this.ensurePullLoop({
      trigger: args.trigger,
      client: args.client,
      config: effectiveConfig,
      pubSub: resolvedPubSub,
      emit: args.emit,
    });
    this.logger.info(
      `Gmail pull trigger active: ${this.describeTrigger(args.trigger)}; mailbox "${effectiveConfig.cfg.mailbox}"; subscription "${resolvedPubSub.subscriptionName}"; poll every ${this.resolvePullIntervalMs()}ms`,
    );
    return nextState;
  }

  async stop(trigger: TriggerInstanceId): Promise<void> {
    const key = this.toKey(trigger);
    const interval = this.pullIntervalsByTrigger.get(key);
    if (interval) {
      clearInterval(interval);
      this.pullIntervalsByTrigger.delete(key);
    }
    this.busyTriggers.delete(key);
    this.activeTriggers.delete(key);
    this.logger.info(`pull loop stopped for ${this.describeTrigger(trigger)}`);
  }

  private ensurePullLoop(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      pubSub: Readonly<{ topicName: string; subscriptionName: string }>;
      emit(items: Items): Promise<void>;
    }>,
  ): void {
    const key = this.toKey(args.trigger);
    if (this.activeTriggers.has(key)) {
      this.logger.debug(`pull loop already active for ${this.describeTrigger(args.trigger)}`);
      return;
    }
    this.activeTriggers.add(key);
    const interval = setInterval(() => {
      void this.pollOnce(args).catch((error: unknown) => {
        this.logError(`poll loop failed for ${this.describeTrigger(args.trigger)}`, error);
      });
    }, this.resolvePullIntervalMs());
    interval.unref();
    this.pullIntervalsByTrigger.set(key, interval);
    this.logger.info(`pull loop started for ${this.describeTrigger(args.trigger)}`);
  }

  private async pollOnce(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      pubSub: Readonly<{ topicName: string; subscriptionName: string }>;
      emit(items: Items): Promise<void>;
    }>,
  ): Promise<void> {
    const key = this.toKey(args.trigger);
    if (this.busyTriggers.has(key)) {
      this.logger.debug(`poll loop skipped overlapping tick for ${this.describeTrigger(args.trigger)}`);
      return;
    }
    this.busyTriggers.add(key);
    try {
      await this.gmailWatchService.ensureSetupState({
        trigger: args.trigger,
        client: args.client,
        mailbox: args.config.cfg.mailbox,
        topicName: args.pubSub.topicName,
        subscriptionName: args.pubSub.subscriptionName,
        labelIds: args.config.cfg.labelIds,
        previousState: (await this.triggerSetupStateStore.load(args.trigger))?.state as
          | GmailTriggerSetupState
          | undefined,
        persist: true,
      });
      const notifications = await args.client.pull({
        subscriptionName: args.pubSub.subscriptionName,
        maxMessages: this.resolveMaxMessagesPerPull(),
      });
      if (notifications.length > 0) {
        this.logger.info(
          `pulled ${notifications.length} Gmail notification(s) for ${this.describeTrigger(args.trigger)}`,
        );
      }
      for (const notification of notifications) {
        await this.processNotification({
          trigger: args.trigger,
          client: args.client,
          config: args.config,
          emit: args.emit,
          notification,
        });
      }
    } finally {
      this.busyTriggers.delete(key);
    }
  }

  private async processNotification(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      emit(items: Items): Promise<void>;
      notification: Awaited<ReturnType<GmailApiClient["pull"]>>[number];
    }>,
  ): Promise<void> {
    const items = await this.gmailHistorySyncService.sync({
      trigger: args.trigger,
      client: args.client,
      config: args.config,
      notification: args.notification.notification,
    });
    if (items.length > 0) {
      this.logger.info(`emitting ${items.length} Gmail item(s) for ${this.describeTrigger(args.trigger)}`);
      await args.emit(items);
    } else {
      this.logger.debug(`notification for ${this.describeTrigger(args.trigger)} produced no matching Gmail items`);
    }
    await args.notification.ack();
  }

  private resolvePullIntervalMs(): number {
    return Math.max(this.options.pullIntervalMs ?? 5_000, 25);
  }

  private resolveMaxMessagesPerPull(): number {
    return Math.max(this.options.maxMessagesPerPull ?? 10, 1);
  }

  private toKey(trigger: TriggerInstanceId): string {
    return `${trigger.workflowId}:${trigger.nodeId}`;
  }

  private describeTrigger(trigger: TriggerInstanceId): string {
    return `${trigger.workflowId}.${trigger.nodeId}`;
  }

  private logError(message: string, error: unknown): void {
    if (error instanceof Error) {
      this.logger.error(message, error);
      return;
    }
    this.logger.error(`${message}: ${String(error)}`);
  }

  /**
   * Dynamic import avoids an ESM circular init cycle: this module → OnNewGmailTrigger → OnNewGmailTriggerNode → this module.
   */
  private async cloneTriggerWithResolvedPubSub(
    config: OnNewGmailTrigger,
    resolvedPubSub: Readonly<{ topicName: string; subscriptionName: string }>,
  ): Promise<OnNewGmailTrigger> {
    const { OnNewGmailTrigger: TriggerCtor } = await import("../nodes/OnNewGmailTrigger");
    // eslint-disable-next-line codemation/no-manual-di-new -- merged trigger config; dynamic import breaks circular module graph
    return new TriggerCtor(config.name, { ...config.cfg, ...resolvedPubSub }, config.id);
  }
}
