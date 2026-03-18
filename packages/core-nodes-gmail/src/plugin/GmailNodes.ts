import type { Container } from "@codemation/core";
import { GoogleGmailApiClient } from "../adapters/google/GoogleGmailApiClient";
import { GooglePubSubPullClient } from "../adapters/google/GooglePubSubPullClient";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailHistorySyncService } from "../services/GmailHistorySyncService";
import { GmailConfiguredLabelService } from "../services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../services/GmailMessageItemMapper";
import { GmailQueryMatcher } from "../services/GmailQueryMatcher";
import { GmailTriggerAttachmentService } from "../services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../services/GmailTriggerTestItemService";
import { GmailWatchService } from "../services/GmailWatchService";
import { GmailPullTriggerRuntime } from "../runtime/GmailPullTriggerRuntime";

type PluginContext = Readonly<{
  container: Container;
  application: unknown;
  loggerFactory: Readonly<{
    create(scope: string): Readonly<{
      info(message: string, exception?: Error): void;
      warn(message: string, exception?: Error): void;
      error(message: string, exception?: Error): void;
      debug(message: string, exception?: Error): void;
    }>;
  }>;
  consumerRoot: string;
  repoRoot: string;
  env: Readonly<Record<string, string | undefined>>;
  workflowSources: ReadonlyArray<string>;
}>;

export class GmailNodes {
  private readonly options: GmailNodesOptions;

  constructor(options: GmailNodesOptions = {}) {
    this.options = options;
  }

  async register(context: PluginContext): Promise<void> {
    this.registerOptions(context.container);
    this.registerServices(context.container, context);
    void context.application;
  }

  private registerOptions(container: Container): void {
    container.registerInstance(GmailNodeTokens.GmailNodesOptions, this.options);
  }

  private registerServices(container: Container, context: PluginContext): void {
    container.registerInstance(GmailNodeTokens.TriggerLogger, context.loggerFactory.create("codemation-gmail.trigger"));
    container.registerInstance(GmailNodeTokens.RuntimeLogger, context.loggerFactory.create("codemation-gmail.runtime"));
    container.register(GmailHistorySyncService, { useClass: GmailHistorySyncService });
    container.register(GmailConfiguredLabelService, { useClass: GmailConfiguredLabelService });
    container.register(GmailMessageItemMapper, { useClass: GmailMessageItemMapper });
    container.register(GmailQueryMatcher, { useClass: GmailQueryMatcher });
    container.register(GmailTriggerAttachmentService, { useClass: GmailTriggerAttachmentService });
    container.register(GmailTriggerTestItemService, { useClass: GmailTriggerTestItemService });
    container.register(GmailWatchService, { useClass: GmailWatchService });
    container.register(GmailPullTriggerRuntime, { useClass: GmailPullTriggerRuntime });
    container.register(GmailNodeTokens.GmailApiClient, {
      useClass: GoogleGmailApiClient,
    });
    container.register(GmailNodeTokens.GmailPubSubPullClient, {
      useClass: GooglePubSubPullClient,
    });
    void context.consumerRoot;
    void context.repoRoot;
    void context.env;
    void context.workflowSources;
  }
}
