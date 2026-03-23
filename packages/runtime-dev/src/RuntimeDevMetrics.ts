export class RuntimeDevMetrics {
  private reloadCount = 0;
  private readonly reloadDurationsMs: number[] = [];
  private readonly engineSwapDurationsMs: number[] = [];
  private readonly maxSamples = 50;

  recordReload(durationMs: number): void {
    this.reloadCount += 1;
    this.pushSample(this.reloadDurationsMs, durationMs);
  }

  recordEngineSwap(durationMs: number): void {
    this.pushSample(this.engineSwapDurationsMs, durationMs);
  }

  getSnapshot(): Readonly<{
    reloadCount: number;
    reloadDurationsMs: ReadonlyArray<number>;
    engineSwapDurationsMs: ReadonlyArray<number>;
    memoryUsage: NodeJS.MemoryUsage;
  }> {
    return {
      reloadCount: this.reloadCount,
      reloadDurationsMs: [...this.reloadDurationsMs],
      engineSwapDurationsMs: [...this.engineSwapDurationsMs],
      memoryUsage: process.memoryUsage(),
    };
  }

  private pushSample(buffer: number[], value: number): void {
    buffer.push(value);
    if (buffer.length > this.maxSamples) {
      buffer.splice(0, buffer.length - this.maxSamples);
    }
  }
}
