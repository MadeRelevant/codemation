import type { CredentialInput, Items, TriggerInstanceId, TriggerSetupStateStore } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger, OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import { GmailHistoryGapError, type GmailApiClient, type GmailMessageRecord } from "./GmailApiClient";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "./GmailMessageItemMapper";
import { GmailQueryMatcher } from "./GmailQueryMatcher";
import type { GmailPubSubNotification } from "./GmailPubSubPullClient";
import { GmailWatchService } from "./GmailWatchService";

@injectable()
export class GmailHistorySyncService {
  constructor(
    @inject(GmailNodeTokens.GmailApiClient) private readonly gmailApiClient: GmailApiClient,
    @inject(CoreTokens.TriggerSetupStateStore) private readonly triggerSetupStateStore: TriggerSetupStateStore,
    @inject(GmailWatchService) private readonly gmailWatchService: GmailWatchService,
    @inject(GmailConfiguredLabelService) private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
    @inject(GmailMessageItemMapper) private readonly gmailMessageItemMapper: GmailMessageItemMapper,
    @inject(GmailQueryMatcher) private readonly gmailQueryMatcher: GmailQueryMatcher,
  ) {}

  async sync(args: Readonly<{
    trigger: TriggerInstanceId;
    config: OnNewGmailTrigger;
    notification: GmailPubSubNotification;
  }>): Promise<Items<OnNewGmailTriggerItemJson>> {
    const currentState = await this.requireCurrentState(args.trigger, args.config);
    try {
      const historyDelta = await this.gmailApiClient.listAddedMessageIds({
        credential: args.config.cfg.credential,
        mailbox: args.config.cfg.mailbox,
        startHistoryId: currentState.historyId,
      });
      const messages = await this.loadMatchingMessages(args.config, historyDelta.messageIds);
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
      await this.gmailWatchService.baselineState({
        trigger: args.trigger,
        credential: args.config.cfg.credential,
        mailbox: args.config.cfg.mailbox,
        topicName: args.config.cfg.topicName,
        subscriptionName: args.config.cfg.subscriptionName,
      });
      return [];
    }
  }

  private async requireCurrentState(trigger: TriggerInstanceId, config: OnNewGmailTrigger): Promise<GmailTriggerSetupState> {
    const persistedState = await this.triggerSetupStateStore.load(trigger);
    const currentState = persistedState?.state as GmailTriggerSetupState | undefined;
    if (currentState) {
      return currentState;
    }
    return await this.gmailWatchService.baselineState({
      trigger,
      credential: config.cfg.credential,
      mailbox: config.cfg.mailbox,
      topicName: config.cfg.topicName,
      subscriptionName: config.cfg.subscriptionName,
    });
  }

  private async loadMatchingMessages(
    config: OnNewGmailTrigger,
    messageIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<GmailMessageRecord>> {
    const resolvedLabelIds = await this.gmailConfiguredLabelService.resolveLabelIds({
      credential: config.cfg.credential,
      mailbox: config.cfg.mailbox,
      configuredLabels: config.cfg.labelIds,
    });
    const uniqueMessageIds = [...new Set(messageIds)];
    const messages = await Promise.all(
      uniqueMessageIds.map(async (messageId) => {
        return await this.gmailApiClient.getMessage({
          credential: config.cfg.credential,
          mailbox: config.cfg.mailbox,
          messageId,
        });
      }),
    );
    return messages.filter((message) => this.matchesConfig(message, config, resolvedLabelIds));
  }

  private matchesConfig(
    message: GmailMessageRecord,
    config: OnNewGmailTrigger,
    resolvedLabelIds: ReadonlyArray<string> | undefined,
  ): boolean {
    if (resolvedLabelIds && resolvedLabelIds.length > 0) {
      const hasEveryLabel = resolvedLabelIds.every((labelId) => message.labelIds.includes(labelId));
      if (!hasEveryLabel) {
        return false;
      }
    }
    return this.gmailQueryMatcher.matches({
      query: config.cfg.query,
      message,
    });
  }
}
