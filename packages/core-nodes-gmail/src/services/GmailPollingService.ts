import type { Item, Items } from "@codemation/core";
import { PollingTriggerDedupWindow, inject, injectable } from "@codemation/core";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger, OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import type { GmailApiClient } from "./GmailApiClient";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "./GmailMessageItemMapper";
import { GmailQueryMatcher } from "./GmailQueryMatcher";

@injectable()
export class GmailPollingService {
  constructor(
    @inject(PollingTriggerDedupWindow) private readonly dedupWindow: PollingTriggerDedupWindow,
    @inject(GmailConfiguredLabelService) private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
    @inject(GmailMessageItemMapper) private readonly gmailMessageItemMapper: GmailMessageItemMapper,
    @inject(GmailQueryMatcher) private readonly gmailQueryMatcher: GmailQueryMatcher,
  ) {}

  async runCycle(
    args: Readonly<{
      previousState: GmailTriggerSetupState | undefined;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      maxMessagesPerPoll: number;
    }>,
  ): Promise<Readonly<{ items: Items<OnNewGmailTriggerItemJson>; nextState: GmailTriggerSetupState }>> {
    const state = this.ensureState({
      previousState: args.previousState,
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
        processedMessageIds: this.dedupWindow.merge(state.processedMessageIds, messageIds),
        baselineComplete: true,
      } satisfies GmailTriggerSetupState;
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
      processedMessageIds: this.dedupWindow.merge(state.processedMessageIds, newIds),
      baselineComplete: true,
    } satisfies GmailTriggerSetupState;
    return { items: items as Items<OnNewGmailTriggerItemJson>, nextState };
  }

  private ensureState(
    args: Readonly<{
      previousState: GmailTriggerSetupState | undefined;
      mailbox: string;
    }>,
  ): GmailTriggerSetupState {
    if (args.previousState) {
      return args.previousState;
    }
    return {
      mailbox: args.mailbox,
      processedMessageIds: [],
      baselineComplete: false,
    };
  }
}
