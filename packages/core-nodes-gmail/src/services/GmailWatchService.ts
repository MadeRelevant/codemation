import type { CredentialInput, TriggerInstanceId, TriggerSetupStateStore } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailApiClient } from "./GmailApiClient";

@injectable()
export class GmailWatchService {
  constructor(
    @inject(GmailNodeTokens.GmailApiClient) private readonly gmailApiClient: GmailApiClient,
    @inject(GmailConfiguredLabelService) private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
    @inject(CoreTokens.TriggerSetupStateStore) private readonly triggerSetupStateStore: TriggerSetupStateStore,
  ) {}

  async ensureSetupState(args: Readonly<{
    trigger: TriggerInstanceId;
    credential: CredentialInput<GmailServiceAccountCredential>;
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
      credential: args.credential,
      mailbox: args.mailbox,
      configuredLabels: args.labelIds,
    });
    const watchRegistration = await this.gmailApiClient.watchMailbox({
      credential: args.credential,
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
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    topicName: string;
    subscriptionName: string;
  }>): Promise<GmailTriggerSetupState> {
    const historyId = await this.gmailApiClient.getCurrentHistoryId({
      credential: args.credential,
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
