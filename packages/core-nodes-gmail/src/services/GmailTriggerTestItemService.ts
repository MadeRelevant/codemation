import type { Items,TriggerInstanceId } from "@codemation/core";
import { inject,injectable } from "@codemation/core";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger,OnNewGmailTriggerItemJson } from "../nodes/OnNewGmailTrigger";
import type { GmailApiClient,GmailMessageRecord } from "./GmailApiClient";
import { GmailConfiguredLabelService } from "./GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "./GmailMessageItemMapper";
import { GmailQueryMatcher } from "./GmailQueryMatcher";

@injectable()
export class GmailTriggerTestItemService {
  constructor(
    @inject(GmailConfiguredLabelService) private readonly gmailConfiguredLabelService: GmailConfiguredLabelService,
    @inject(GmailMessageItemMapper) private readonly gmailMessageItemMapper: GmailMessageItemMapper,
    @inject(GmailQueryMatcher) private readonly gmailQueryMatcher: GmailQueryMatcher,
  ) {}

  async createItems(args: Readonly<{
    trigger: TriggerInstanceId;
    client: GmailApiClient;
    config: OnNewGmailTrigger;
    previousState: GmailTriggerSetupState | undefined;
  }>): Promise<Items<OnNewGmailTriggerItemJson>> {
    void args.trigger;
    const resolvedLabelIds = await this.gmailConfiguredLabelService.resolveLabelIds({
      client: args.client,
      mailbox: args.config.cfg.mailbox,
      configuredLabels: args.config.cfg.labelIds,
    });
    const messageIds = await args.client.listMessageIds({
      mailbox: args.config.cfg.mailbox,
      labelIds: resolvedLabelIds,
      query: args.config.cfg.query,
      maxResults: 1,
    });
    if (messageIds.length === 0) {
      return [];
    }
    const message = await args.client.getMessage({
      mailbox: args.config.cfg.mailbox,
      messageId: messageIds[0]!,
    });
    if (!this.matchesConfig(message, args.config, resolvedLabelIds)) {
      return [];
    }
    const historyId = message.historyId ?? args.previousState?.historyId ?? (await args.client.getCurrentHistoryId({ mailbox: args.config.cfg.mailbox }));
    return this.gmailMessageItemMapper.mapMany({
      mailbox: args.config.cfg.mailbox,
      historyId,
      messages: [message],
    });
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
