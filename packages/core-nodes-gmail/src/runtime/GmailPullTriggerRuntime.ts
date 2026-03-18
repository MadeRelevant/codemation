import type { CredentialInput, CredentialService, Items, TriggerInstanceId, TriggerSetupStateStore } from "@codemation/core";
import { CoreTokens, inject, injectable, resolveCredential } from "@codemation/core";
import type { GmailLogger } from "../contracts/GmailLogger";
import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger } from "../nodes/OnNewGmailTrigger";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailHistorySyncService } from "../services/GmailHistorySyncService";
import type { GmailPubSubPullClient, GmailPulledNotification } from "../services/GmailPubSubPullClient";
import { GmailWatchService } from "../services/GmailWatchService";

@injectable()
export class GmailPullTriggerRuntime {
  private readonly activeTriggers = new Set<string>();
  private readonly pullIntervalsByTrigger = new Map<string, NodeJS.Timeout>();
  private readonly busyTriggers = new Set<string>();

  constructor(
    @inject(GmailNodeTokens.GmailPubSubPullClient) private readonly gmailPubSubPullClient: GmailPubSubPullClient,
    @inject(GmailNodeTokens.GmailNodesOptions) private readonly options: GmailNodesOptions,
    @inject(CoreTokens.CredentialService) private readonly credentialService: CredentialService,
    @inject(CoreTokens.TriggerSetupStateStore) private readonly triggerSetupStateStore: TriggerSetupStateStore,
    @inject(GmailNodeTokens.RuntimeLogger) private readonly logger: GmailLogger,
    @inject(GmailWatchService) private readonly gmailWatchService: GmailWatchService,
    @inject(GmailHistorySyncService) private readonly gmailHistorySyncService: GmailHistorySyncService,
  ) {}

  async ensureStarted(args: Readonly<{
    trigger: TriggerInstanceId;
    config: OnNewGmailTrigger;
    previousState: GmailTriggerSetupState | undefined;
    emit(items: Items): Promise<void>;
  }>): Promise<GmailTriggerSetupState | undefined> {
    if (!this.hasRequiredConfiguration(args.config)) {
      this.logger.warn(
        `skipping trigger ${this.describeTrigger(args.trigger)} because mailbox/topic/subscription configuration is incomplete`,
      );
      return args.previousState;
    }
    this.logger.info(
      `starting pull runtime for ${this.describeTrigger(args.trigger)} on mailbox "${args.config.cfg.mailbox}"`,
    );
    const credential = await this.resolveCredential(args.config.cfg.credential, args.trigger, args.config);
    await this.gmailPubSubPullClient.ensureSubscription({
      credential,
      topicName: args.config.cfg.topicName,
      subscriptionName: args.config.cfg.subscriptionName,
    });
    const nextState = await this.gmailWatchService.ensureSetupState({
      trigger: args.trigger,
      credential: args.config.cfg.credential,
      mailbox: args.config.cfg.mailbox,
      topicName: args.config.cfg.topicName,
      subscriptionName: args.config.cfg.subscriptionName,
      labelIds: args.config.cfg.labelIds,
      previousState: args.previousState,
      persist: false,
    });
    this.ensurePullLoop({
      trigger: args.trigger,
      config: args.config,
      emit: args.emit,
    });
    this.logger.info(
      `pull runtime ready for ${this.describeTrigger(args.trigger)} with subscription "${args.config.cfg.subscriptionName}" and interval ${this.resolvePullIntervalMs()}ms`,
    );
    return nextState;
  }

  private ensurePullLoop(args: Readonly<{
    trigger: TriggerInstanceId;
    config: OnNewGmailTrigger;
    emit(items: Items): Promise<void>;
  }>): void {
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

  private async pollOnce(args: Readonly<{
    trigger: TriggerInstanceId;
    config: OnNewGmailTrigger;
    emit(items: Items): Promise<void>;
  }>): Promise<void> {
    const key = this.toKey(args.trigger);
    if (this.busyTriggers.has(key)) {
      this.logger.debug(`poll loop skipped overlapping tick for ${this.describeTrigger(args.trigger)}`);
      return;
    }
    this.busyTriggers.add(key);
    try {
      await this.gmailWatchService.ensureSetupState({
        trigger: args.trigger,
        credential: args.config.cfg.credential,
        mailbox: args.config.cfg.mailbox,
        topicName: args.config.cfg.topicName,
        subscriptionName: args.config.cfg.subscriptionName,
        labelIds: args.config.cfg.labelIds,
        previousState: (await this.triggerSetupStateStore.load(args.trigger))?.state as GmailTriggerSetupState | undefined,
        persist: true,
      });
      const notifications = await this.gmailPubSubPullClient.pull({
        credential: await this.resolveCredential(args.config.cfg.credential),
        subscriptionName: args.config.cfg.subscriptionName,
        maxMessages: this.resolveMaxMessagesPerPull(),
      });
      if (notifications.length > 0) {
        this.logger.info(`pulled ${notifications.length} Gmail notification(s) for ${this.describeTrigger(args.trigger)}`);
      }
      for (const notification of notifications) {
        await this.processNotification({
          trigger: args.trigger,
          config: args.config,
          emit: args.emit,
          notification,
        });
      }
    } finally {
      this.busyTriggers.delete(key);
    }
  }

  private async processNotification(args: Readonly<{
    trigger: TriggerInstanceId;
    config: OnNewGmailTrigger;
    emit(items: Items): Promise<void>;
    notification: GmailPulledNotification;
  }>): Promise<void> {
    const items = await this.gmailHistorySyncService.sync({
      trigger: args.trigger,
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

  private async resolveCredential(
    credential: CredentialInput<GmailServiceAccountCredential>,
    trigger?: TriggerInstanceId,
    config?: OnNewGmailTrigger,
  ): Promise<GmailServiceAccountCredential> {
    try {
      return await resolveCredential(credential, this.credentialService);
    } catch (error) {
      this.logError(
        `failed to resolve Gmail credentials${trigger && config ? ` for ${this.describeTrigger(trigger)} on mailbox "${config.cfg.mailbox}"` : ""}`,
        error,
      );
      throw error;
    }
  }

  private resolvePullIntervalMs(): number {
    return Math.max(this.options.pullIntervalMs ?? 5_000, 25);
  }

  private resolveMaxMessagesPerPull(): number {
    return Math.max(this.options.maxMessagesPerPull ?? 10, 1);
  }

  private hasRequiredConfiguration(config: OnNewGmailTrigger): boolean {
    return (
      config.cfg.mailbox.trim().length > 0 &&
      config.cfg.topicName.trim().length > 0 &&
      config.cfg.subscriptionName.trim().length > 0
    );
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
}
