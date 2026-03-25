import type { Items, TriggerInstanceId, TriggerSetupStateStore } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger, OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import { GmailHistoryGapError, type GmailApiClient, type GmailMessageRecord } from "./GmailApiClient";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "./GmailMessageItemMapper";
import type { GmailPubSubNotification } from "./GmailPubSubPullClient";
import { GmailQueryMatcher } from "./GmailQueryMatcher";
import { GmailTriggerPubSubResourceResolver } from "./GmailTriggerPubSubResourceResolver";
import { GmailWatchService } from "./GmailWatchService";

@injectable()
export class GmailHistorySyncService {
  constructor(
    @inject(CoreTokens.TriggerSetupStateStore) private readonly triggerSetupStateStore: TriggerSetupStateStore,
    @inject(GmailWatchService) private readonly gmailWatchService: GmailWatchService,
    @inject(GmailConfiguredLabelService) private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
    @inject(GmailMessageItemMapper) private readonly gmailMessageItemMapper: GmailMessageItemMapper,
    @inject(GmailQueryMatcher) private readonly gmailQueryMatcher: GmailQueryMatcher,
    @inject(GmailTriggerPubSubResourceResolver)
    private readonly gmailTriggerPubSubResourceResolver: GmailTriggerPubSubResourceResolver,
  ) {}

  async sync(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      notification: GmailPubSubNotification;
    }>,
  ): Promise<Items<OnNewGmailTriggerItemJson>> {
    const currentState = await this.requireCurrentState(args.trigger, args.client, args.config);
    try {
      const historyDelta = await args.client.listAddedMessageIds({
        mailbox: args.config.cfg.mailbox,
        startHistoryId: currentState.historyId,
      });
      const messages = await this.loadMatchingMessages(args.client, args.config, historyDelta.messageIds);
      const nextState = {
        ...currentState,
        historyId: historyDelta.historyId,
        lastNotificationAt: args.notification.publishTime ?? new Date().toISOString(),
        lastSynchronizedAt: new Date().toISOString(),
      } satisfies GmailTriggerSetupState;
      await this.triggerSetupStateStore.save({
        trigger: args.trigger,
        updatedAt: new Date().toISOString(),
        state: nextState,
      });
      return this.gmailMessageItemMapper.mapMany({
        mailbox: args.config.cfg.mailbox,
        historyId: historyDelta.historyId,
        messages,
      });
    } catch (error) {
      if (!(error instanceof GmailHistoryGapError)) {
        throw error;
      }
      const pubSub = this.resolvePubSub(args.client, args.config);
      if (!pubSub) {
        throw new Error(
          "Could not resolve Pub/Sub topic/subscription for Gmail history baseline (set them on the trigger, or GMAIL_TRIGGER_TOPIC_NAME / GMAIL_TRIGGER_SUBSCRIPTION_NAME, or GOOGLE_CLOUD_PROJECT).",
          { cause: error },
        );
      }
      await this.gmailWatchService.baselineState({
        trigger: args.trigger,
        client: args.client,
        mailbox: args.config.cfg.mailbox,
        topicName: pubSub.topicName,
        subscriptionName: pubSub.subscriptionName,
      });
      return [];
    }
  }

  private async requireCurrentState(
    trigger: TriggerInstanceId,
    client: GmailApiClient,
    config: OnNewGmailTrigger,
  ): Promise<GmailTriggerSetupState> {
    const persistedState = await this.triggerSetupStateStore.load(trigger);
    const currentState = persistedState?.state as GmailTriggerSetupState | undefined;
    if (currentState) {
      return currentState;
    }
    const pubSub = this.resolvePubSub(client, config);
    if (!pubSub) {
      throw new Error(
        "Could not resolve Pub/Sub topic/subscription for Gmail trigger setup (set them on the trigger, or GMAIL_TRIGGER_TOPIC_NAME / GMAIL_TRIGGER_SUBSCRIPTION_NAME, or GOOGLE_CLOUD_PROJECT).",
      );
    }
    return await this.gmailWatchService.baselineState({
      trigger,
      client,
      mailbox: config.cfg.mailbox,
      topicName: pubSub.topicName,
      subscriptionName: pubSub.subscriptionName,
    });
  }

  private resolvePubSub(
    client: GmailApiClient,
    config: OnNewGmailTrigger,
  ): Readonly<{ topicName: string; subscriptionName: string }> | undefined {
    return this.gmailTriggerPubSubResourceResolver.resolve(config.cfg, client.getDefaultGcpProjectIdForPubSub());
  }

  private async loadMatchingMessages(
    client: GmailApiClient,
    config: OnNewGmailTrigger,
    messageIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<GmailMessageRecord>> {
    const resolvedLabelIds = await this.gmailConfiguredLabelService.resolveLabelIds({
      client,
      mailbox: config.cfg.mailbox,
      configuredLabels: config.cfg.labelIds,
    });
    const uniqueMessageIds = [...new Set(messageIds)];
    const messages = await Promise.all(
      uniqueMessageIds.map(async (messageId) => {
        return await client.getMessage({
          mailbox: config.cfg.mailbox,
          messageId,
        });
      }),
    );
    return messages.filter((message) => this.gmailQueryMatcher.matchesOnNewTrigger(message, config, resolvedLabelIds));
  }
}
