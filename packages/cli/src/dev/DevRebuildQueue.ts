export type DevRebuildRequest = Readonly<{
  changedPaths: ReadonlyArray<string>;
  configPathOverride?: string;
  shouldRestartUi: boolean;
}>;

export interface DevRebuildHandler {
  run(request: DevRebuildRequest): Promise<void>;
}

export class DevRebuildQueue {
  private pendingRequest: DevRebuildRequest | null = null;
  private drainPromise: Promise<void> | null = null;

  constructor(private readonly handler: DevRebuildHandler) {}

  async enqueue(request: DevRebuildRequest): Promise<void> {
    this.pendingRequest = this.mergePendingRequest(this.pendingRequest, request);
    if (!this.drainPromise) {
      this.drainPromise = this.drain();
    }
    return await this.drainPromise;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pendingRequest) {
        const nextRequest = this.pendingRequest;
        this.pendingRequest = null;
        await this.handler.run(nextRequest);
      }
    } finally {
      this.drainPromise = null;
      if (this.pendingRequest) {
        this.drainPromise = this.drain();
        await this.drainPromise;
      }
    }
  }

  private mergePendingRequest(current: DevRebuildRequest | null, next: DevRebuildRequest): DevRebuildRequest {
    if (!current) {
      return {
        ...next,
        changedPaths: [...next.changedPaths],
      };
    }
    return {
      changedPaths: [...new Set([...current.changedPaths, ...next.changedPaths])],
      configPathOverride: next.configPathOverride ?? current.configPathOverride,
      shouldRestartUi: current.shouldRestartUi || next.shouldRestartUi,
    };
  }
}
