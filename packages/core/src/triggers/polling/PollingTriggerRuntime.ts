import type { Items, TriggerInstanceId, TriggerSetupStateRepository } from "../../types";
import type { PollingTriggerLogger } from "./PollingTriggerLogger";

export interface PollingRunCycleArgs<TState> {
  previousState: TState | undefined;
  signal: AbortSignal;
}

export interface PollingRunCycleResult<TState, TItem> {
  items: Items<TItem>;
  nextState: TState;
}

export interface PollingTriggerStartArgs<TState, TItem> {
  trigger: TriggerInstanceId;
  intervalMs: number;
  seedState?: TState;
  runCycle: (cycleCtx: PollingRunCycleArgs<TState>) => Promise<PollingRunCycleResult<TState, TItem>>;
  emit: (items: Items) => Promise<void>;
}

/**
 * Generic polling-trigger runtime. Owns the set-interval loop, overlap guard, and persistence.
 * Constructed by {@link import("../../runtime/EngineFactory").EngineFactory} and exposed to plugin
 * authors via {@link import("../../contracts/runtimeTypes").TriggerSetupContext}.polling.
 */
export class PollingTriggerRuntime {
  private readonly activeTriggers = new Set<string>();
  private readonly intervalsByTrigger = new Map<string, ReturnType<typeof setInterval>>();
  private readonly busyTriggers = new Set<string>();

  constructor(
    private readonly triggerSetupStateRepository: TriggerSetupStateRepository,
    private readonly logger: PollingTriggerLogger,
  ) {}

  async start<TState, TItem>(args: PollingTriggerStartArgs<TState, TItem>): Promise<TState | undefined> {
    let first: TState | undefined;
    try {
      first = await this.runCycle(args, { seedState: args.seedState });
    } catch (err: unknown) {
      this.logError(`Polling trigger initial cycle failed for ${this.describe(args.trigger)}`, err);
    }
    this.ensureLoop(args);
    return first;
  }

  async stop(trigger: TriggerInstanceId): Promise<void> {
    const key = this.toKey(trigger);
    const interval = this.intervalsByTrigger.get(key);
    if (interval !== undefined) {
      clearInterval(interval);
      this.intervalsByTrigger.delete(key);
    }
    this.busyTriggers.delete(key);
    this.activeTriggers.delete(key);
    this.logger.debug(`Polling trigger stopped for ${this.describe(trigger)}`);
  }

  private ensureLoop<TState, TItem>(args: PollingTriggerStartArgs<TState, TItem>): void {
    const key = this.toKey(args.trigger);
    if (this.activeTriggers.has(key)) {
      this.logger.debug(`Polling trigger already active for ${this.describe(args.trigger)}`);
      return;
    }
    this.activeTriggers.add(key);
    const intervalMs = Math.max(args.intervalMs, 25);
    const interval = setInterval(() => {
      void this.runCycle(args, { seedState: undefined }).catch((err: unknown) => {
        this.logError(`Polling trigger cycle failed for ${this.describe(args.trigger)}`, err);
      });
    }, intervalMs);
    this.intervalsByTrigger.set(key, interval);
    this.logger.info(`Polling trigger started for ${this.describe(args.trigger)} (interval ${intervalMs}ms)`);
  }

  private async runCycle<TState, TItem>(
    args: PollingTriggerStartArgs<TState, TItem>,
    opts: { seedState: TState | undefined },
  ): Promise<TState | undefined> {
    const key = this.toKey(args.trigger);
    if (this.busyTriggers.has(key)) {
      this.logger.debug(`Polling trigger skipping overlapping tick for ${this.describe(args.trigger)}`);
      return undefined;
    }
    this.busyTriggers.add(key);
    try {
      const loaded = await this.triggerSetupStateRepository.load(args.trigger);
      const previousState = loaded !== undefined ? (loaded.state as TState | undefined) : opts.seedState;
      const controller = new AbortController();
      const { items, nextState } = await args.runCycle({ previousState, signal: controller.signal });
      await this.triggerSetupStateRepository.save({
        trigger: args.trigger,
        updatedAt: new Date().toISOString(),
        state: nextState as never,
      });
      if (items.length > 0) {
        this.logger.info(`Polling trigger emitting ${items.length} item(s) for ${this.describe(args.trigger)}`);
        await args.emit(items);
      }
      return nextState;
    } finally {
      this.busyTriggers.delete(key);
    }
  }

  private toKey(trigger: TriggerInstanceId): string {
    return `${trigger.workflowId}:${trigger.nodeId}`;
  }

  private describe(trigger: TriggerInstanceId): string {
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
