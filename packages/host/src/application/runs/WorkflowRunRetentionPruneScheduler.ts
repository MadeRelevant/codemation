import type { RunPruneListingStore, RunStateStore } from "@codemation/core";
import { injectable } from "@codemation/core";

type PruneCapableRunStore = RunStateStore & RunPruneListingStore;

/**
 * Timer-driven pruning of completed/failed runs older than a retention window.
 * Requires {@link RunStateStore.deleteRun} and {@link RunPruneListingStore.listRunsOlderThan}.
 */
@injectable()
export class WorkflowRunRetentionPruneScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly runStore: PruneCapableRunStore,
    private readonly retentionSeconds: number,
    private readonly intervalMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (!this.runStore.deleteRun || !this.runStore.listRunsOlderThan) return;
    const beforeIso = new Date(this.now().getTime() - this.retentionSeconds * 1000).toISOString();
    const candidates = await this.runStore.listRunsOlderThan({ beforeIso, limit: 50 });
    for (const c of candidates) {
      await this.runStore.deleteRun(c.runId);
    }
  }
}
