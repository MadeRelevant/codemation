import type { Items, TriggerInstanceId } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import type { GmailLogger } from "../contracts/GmailLogger";
import type { GmailNodesOptions } from "../contracts/GmailNodesOptions";
import { GmailNodeTokens } from "../contracts/GmailNodeTokens";
import type { GmailTriggerSetupState } from "../contracts/GmailTriggerSetupState";
import type { OnNewGmailTrigger } from "../nodes/OnNewGmailTrigger";
import type { GmailApiClient } from "../services/GmailApiClient";
import { GmailPollingService } from "../services/GmailPollingService";

@injectable()
export class GmailPollingTriggerRuntime {
  private readonly activeTriggers = new Set<string>();
  private readonly pollIntervalsByTrigger = new Map<string, NodeJS.Timeout>();
  private readonly busyTriggers = new Set<string>();

  constructor(
    @inject(GmailNodeTokens.GmailNodesOptions) private readonly options: GmailNodesOptions,
    @inject(GmailNodeTokens.RuntimeLogger) private readonly logger: GmailLogger,
    @inject(GmailPollingService) private readonly gmailPollingService: GmailPollingService,
  ) {}

  async ensureStarted(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      previousState: GmailTriggerSetupState | undefined;
      emit(items: Items): Promise<void>;
    }>,
  ): Promise<GmailTriggerSetupState | undefined> {
    if (!args.config.hasRequiredConfiguration()) {
      const missingFields = args.config.resolveMissingConfigurationFields();
      this.logger.warn(
        `Gmail polling trigger skipped (${this.describeTrigger(args.trigger)}): missing ${missingFields.join(", ")}`,
      );
      return args.previousState;
    }
    const first = await this.runPollCycle(args, { seedState: args.previousState });
    this.ensurePollLoop(args);
    return first;
  }

  async stop(trigger: TriggerInstanceId): Promise<void> {
    const key = this.toKey(trigger);
    const interval = this.pollIntervalsByTrigger.get(key);
    if (interval) {
      clearInterval(interval);
      this.pollIntervalsByTrigger.delete(key);
    }
    this.busyTriggers.delete(key);
    this.activeTriggers.delete(key);
    this.logger.info(`Gmail polling stopped for ${this.describeTrigger(trigger)}`);
  }

  private ensurePollLoop(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      emit(items: Items): Promise<void>;
    }>,
  ): void {
    const key = this.toKey(args.trigger);
    if (this.activeTriggers.has(key)) {
      this.logger.debug(`Gmail polling already active for ${this.describeTrigger(args.trigger)}`);
      return;
    }
    this.activeTriggers.add(key);
    const interval = setInterval(() => {
      void this.runPollCycle(args, { seedState: undefined }).catch((error: unknown) => {
        this.logError(`Gmail poll failed for ${this.describeTrigger(args.trigger)}`, error);
      });
    }, this.resolvePollIntervalMs());
    this.pollIntervalsByTrigger.set(key, interval);
    this.logger.info(`Gmail polling started for ${this.describeTrigger(args.trigger)}`);
  }

  private async runPollCycle(
    args: Readonly<{
      trigger: TriggerInstanceId;
      client: GmailApiClient;
      config: OnNewGmailTrigger;
      emit(items: Items): Promise<void>;
    }>,
    pollArgs: Readonly<{ seedState: GmailTriggerSetupState | undefined }>,
  ): Promise<GmailTriggerSetupState | undefined> {
    const key = this.toKey(args.trigger);
    if (this.busyTriggers.has(key)) {
      this.logger.debug(`Gmail poll skipped overlapping tick for ${this.describeTrigger(args.trigger)}`);
      return undefined;
    }
    this.busyTriggers.add(key);
    try {
      const { items, nextState } = await this.gmailPollingService.poll({
        trigger: args.trigger,
        client: args.client,
        config: args.config,
        maxMessagesPerPoll: this.resolveMaxMessagesPerPoll(),
        seedState: pollArgs.seedState,
      });
      if (items.length > 0) {
        this.logger.info(`emitting ${items.length} Gmail item(s) for ${this.describeTrigger(args.trigger)}`);
        await args.emit(items);
      }
      return nextState;
    } finally {
      this.busyTriggers.delete(key);
    }
  }

  private resolvePollIntervalMs(): number {
    return Math.max(this.options.pollIntervalMs ?? 60_000, 25);
  }

  private resolveMaxMessagesPerPoll(): number {
    return Math.max(this.options.maxMessagesPerPoll ?? 20, 1);
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
