import type { Item, Items, TriggerInstanceId, TriggerSetupStateRepository } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger, OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import type { GmailApiClient } from "./GmailApiClient";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "./GmailMessageItemMapper";
import { GmailQueryMatcher } from "./GmailQueryMatcher";

@injectable()
export class GmailPollingService {
  private static readonly maxProcessedIds = 2000;

  constructor(
    @inject(CoreTokens.TriggerSetupStateRepository)
    private readonly triggerSetupStateRepository: TriggerSetupStateRepository,
    @inject(GmailConfiguredLabelService) private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
    @inject(GmailMessageItemMapper) private readonly gmailMessageItemMapper: GmailMessageItemMapper,
    @inject(GmailQueryMatcher) private readonly gmailQueryMatcher: GmailQueryMatcher,
  ) {}

  async poll(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      maxMessagesPerPoll: number;
      /** When the trigger store is empty, seed from the engine (e.g. last run). Only the first poll should pass this. */
      seedState: GmailTriggerSetupState | undefined;
    }>,
  ): Promise<Readonly<{ items: Items<OnNewGmailTriggerItemJson>; nextState: GmailTriggerSetupState }>> {
    const loaded = await this.triggerSetupStateRepository.load(args.trigger);
    const state = this.ensureState({
      fromStore: loaded?.state as GmailTriggerSetupState | undefined,
      seed: args.seedState,
      mailbox: args.config.cfg.mailbox,
    });
    const resolvedLabelIds = await this.gmailConfiguredLabelService.resolveLabelIds({
      client: args.client,
      mailbox: args.config.cfg.mailbox,
      configuredLabels: args.config.cfg.labelIds,
    });
    const messageIds = await args.client.listMessageIds({
      mailbox: args.config.cfg.mailbox,
      labelIds: resolvedLabelIds,
      query: args.config.cfg.query,
      maxResults: args.maxMessagesPerPoll,
    });
    const processedSet = new Set(state.processedMessageIds);
    if (!state.baselineComplete) {
      const nextState = {
        mailbox: state.mailbox,
        processedMessageIds: this.mergeProcessedIds(processedSet, messageIds),
        baselineComplete: true,
      } satisfies GmailTriggerSetupState;
      await this.persist(args.trigger, nextState);
      return { items: [], nextState };
    }
    const newIds = messageIds.filter((id) => !processedSet.has(id));
    const historyId = await args.client.getCurrentHistoryId({ mailbox: args.config.cfg.mailbox });
    const items: Item<OnNewGmailTriggerItemJson>[] = [];
    for (const messageId of [...newIds].reverse()) {
      const message = await args.client.getMessage({
        mailbox: args.config.cfg.mailbox,
        messageId,
      });
      if (!this.gmailQueryMatcher.matchesOnNewTrigger(message, resolvedLabelIds)) {
        continue;
      }
      items.push(
        ...this.gmailMessageItemMapper.mapMany({
          mailbox: args.config.cfg.mailbox,
          historyId,
          messages: [message],
        }),
      );
    }
    const nextState = {
      mailbox: state.mailbox,
      processedMessageIds: this.mergeProcessedIds(processedSet, newIds),
      baselineComplete: true,
    } satisfies GmailTriggerSetupState;
    await this.persist(args.trigger, nextState);
    return { items: items as Items<OnNewGmailTriggerItemJson>, nextState };
  }

  private ensureState(
    args: Readonly<{
      fromStore: GmailTriggerSetupState | undefined;
      seed: GmailTriggerSetupState | undefined;
      mailbox: string;
    }>,
  ): GmailTriggerSetupState {
    if (args.fromStore) {
      return args.fromStore;
    }
    if (args.seed) {
      return args.seed;
    }
    return {
      mailbox: args.mailbox,
      processedMessageIds: [],
      baselineComplete: false,
    };
  }

  private mergeProcessedIds(existing: Set<string>, incoming: ReadonlyArray<string>): ReadonlyArray<string> {
    for (const id of incoming) {
      existing.add(id);
    }
    const merged = [...existing];
    if (merged.length <= GmailPollingService.maxProcessedIds) {
      return merged;
    }
    return merged.slice(merged.length - GmailPollingService.maxProcessedIds);
  }

  private async persist(trigger: TriggerInstanceId, state: GmailTriggerSetupState): Promise<void> {
    await this.triggerSetupStateRepository.save({
      trigger,
      updatedAt: new Date().toISOString(),
      state,
    });
  }
}
