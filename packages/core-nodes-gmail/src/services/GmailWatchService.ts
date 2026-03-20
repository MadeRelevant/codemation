import type { TriggerInstanceId,TriggerSetupStateStore } from "@codemation/core";
import { CoreTokens,inject,injectable } from "@codemation/core";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { GmailApiClient } from "./GmailApiClient";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";

@injectable()
export class GmailWatchService {
  constructor(
    @inject(GmailConfiguredLabelService) private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
    @inject(CoreTokens.TriggerSetupStateStore) private readonly triggerSetupStateStore: TriggerSetupStateStore,
  ) {}

  async ensureSetupState(args: Readonly<{
    trigger: TriggerInstanceId;
    client: GmailApiClient;
    mailbox: string;
    topicName: string;
    subscriptionName: string;
    labelIds?: ReadonlyArray<string>;
    previousState: GmailTriggerSetupState | undefined;
    persist: boolean;
  }>): Promise<GmailTriggerSetupState> {
    const currentState = await this.loadCurrentState(args.trigger, args.previousState);
    if (currentState && !this.isExpiringSoon(currentState.watchExpiration)) {
      return currentState;
    }
    const resolvedLabelIds = await this.gmailConfiguredLabelService.resolveLabelIds({
      client: args.client,
      mailbox: args.mailbox,
      configuredLabels: args.labelIds,
    });
    await args.client.ensureSubscription({
      topicName: args.topicName,
      subscriptionName: args.subscriptionName,
    });
    const watchRegistration = await args.client.watchMailbox({
      mailbox: args.mailbox,
      topicName: args.topicName,
      labelIds: resolvedLabelIds,
    });
    const nextState = {
      mailbox: args.mailbox,
      topicName: args.topicName,
      subscriptionName: args.subscriptionName,
      historyId: currentState?.historyId ?? watchRegistration.historyId,
      watchExpiration: watchRegistration.expirationAt,
      ...(currentState?.lastNotificationAt ? { lastNotificationAt: currentState.lastNotificationAt } : {}),
      ...(currentState?.lastSynchronizedAt ? { lastSynchronizedAt: currentState.lastSynchronizedAt } : {}),
    } satisfies GmailTriggerSetupState;
    if (args.persist) {
      await this.triggerSetupStateStore.save({
        trigger: args.trigger,
        updatedAt: new Date().toISOString(),
        state: nextState,
      });
    }
    return nextState;
  }

  async baselineState(args: Readonly<{
    trigger: TriggerInstanceId;
    client: GmailApiClient;
    mailbox: string;
    topicName: string;
    subscriptionName: string;
  }>): Promise<GmailTriggerSetupState> {
    const historyId = await args.client.getCurrentHistoryId({
      mailbox: args.mailbox,
    });
    const state = {
      mailbox: args.mailbox,
      topicName: args.topicName,
      subscriptionName: args.subscriptionName,
      historyId,
      watchExpiration: new Date(0).toISOString(),
    } satisfies GmailTriggerSetupState;
    await this.triggerSetupStateStore.save({
      trigger: args.trigger,
      updatedAt: new Date().toISOString(),
      state,
    });
    return state;
  }

  private async loadCurrentState(
    trigger: TriggerInstanceId,
    previousState: GmailTriggerSetupState | undefined,
  ): Promise<GmailTriggerSetupState | undefined> {
    const persistedState = await this.triggerSetupStateStore.load(trigger);
    return (persistedState?.state as GmailTriggerSetupState | undefined) ?? previousState;
  }

  private isExpiringSoon(expiration: string): boolean {
    return new Date(expiration).getTime() - Date.now() <= 5 * 60 * 1_000;
  }
}
