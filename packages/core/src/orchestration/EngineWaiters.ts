import type { RunId, RunResult, WebhookRunResult } from "../types";

export class EngineWaiters {
  private readonly completionWaiters = new Map<RunId, Array<(result: RunResult) => void>>();
  private readonly webhookResponseWaiters = new Map<RunId, Array<(result: WebhookRunResult) => void>>();

  waitForCompletion(runId: RunId): Promise<RunResult> {
    return new Promise((resolve) => {
      const list = this.completionWaiters.get(runId) ?? [];
      list.push(resolve);
      this.completionWaiters.set(runId, list);
    });
  }

  waitForWebhookResponse(runId: RunId): Promise<WebhookRunResult> {
    return new Promise((resolve) => {
      const list = this.webhookResponseWaiters.get(runId) ?? [];
      list.push(resolve);
      this.webhookResponseWaiters.set(runId, list);
    });
  }

  resolveRunCompletion(result: RunResult): void {
    if (result.status !== "completed" && result.status !== "failed") return;
    const list = this.completionWaiters.get(result.runId);
    if (!list || list.length === 0) return;
    this.completionWaiters.delete(result.runId);
    for (const r of list) r(result);
  }

  resolveWebhookResponse(result: WebhookRunResult): void {
    const list = this.webhookResponseWaiters.get(result.runId);
    if (!list || list.length === 0) return;
    this.webhookResponseWaiters.delete(result.runId);
    for (const resolve of list) resolve(result);
  }
}
