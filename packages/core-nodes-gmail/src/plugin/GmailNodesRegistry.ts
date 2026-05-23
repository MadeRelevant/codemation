import type { Container } from "@codemation/core";
import { PollingTriggerDedupWindow } from "@codemation/core";
import type { CodemationPluginContext } from "@codemation/host";
import { GoogleGmailApiClientFactory } from "../adapters/google/GoogleGmailApiClientFactory";
import { oauthGoogleGmailType } from "../credentials/oauthGoogleGmailType";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import { BinaryStreamCollector } from "../services/BinaryStreamCollector";
import { GmailConfiguredLabelService } from "../services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../services/GmailMessageItemMapper";
import { GmailModifyLabelsService } from "../services/GmailModifyLabelsService";
import { GmailPollingService } from "../services/GmailPollingService";
import { GmailQueryMatcher } from "../services/GmailQueryMatcher";
import { GmailReplyToMessageService } from "../services/GmailReplyToMessageService";
import { GmailSendMessageService } from "../services/GmailSendMessageService";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";

export class GmailNodes {
  private readonly options: GmailNodesOptions;

  constructor(options: GmailNodesOptions = {}) {
    this.options = options;
  }

  async register(context: CodemationPluginContext): Promise<void> {
    this.registerOptions(context.container);
    this.registerServices(context.container, context);
    this.registerCredentialTypes(context);
  }

  private registerOptions(container: Container): void {
    container.registerInstance(GmailNodeTokens.GmailNodesOptions, this.options);
  }

  private registerServices(container: Container, context: CodemationPluginContext): void {
    container.registerInstance(GmailNodeTokens.TriggerLogger, context.loggerFactory.create("codemation-gmail.trigger"));
    container.registerSingleton(BinaryStreamCollector, BinaryStreamCollector);
    container.registerSingleton(GoogleGmailApiClientFactory, GoogleGmailApiClientFactory);
    container.registerSingleton(GmailConfiguredLabelService, GmailConfiguredLabelService);
    container.registerSingleton(GmailMessageItemMapper, GmailMessageItemMapper);
    container.registerSingleton(GmailModifyLabelsService, GmailModifyLabelsService);
    container.registerSingleton(GmailQueryMatcher, GmailQueryMatcher);
    container.registerSingleton(GmailReplyToMessageService, GmailReplyToMessageService);
    container.registerSingleton(GmailSendMessageService, GmailSendMessageService);
    container.registerSingleton(GmailTriggerAttachmentService, GmailTriggerAttachmentService);
    container.registerSingleton(GmailTriggerTestItemService, GmailTriggerTestItemService);
    container.registerInstance(PollingTriggerDedupWindow, new PollingTriggerDedupWindow());
    container.registerSingleton(GmailPollingService, GmailPollingService);
    void context.appConfig;
  }

  private registerCredentialTypes(context: CodemationPluginContext): void {
    context.registerCredentialType(oauthGoogleGmailType);
  }
}
