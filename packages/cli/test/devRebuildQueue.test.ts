import assert from "node:assert/strict";
import { test } from "vitest";

import { DevRebuildQueue, type DevRebuildHandler, type DevRebuildRequest } from "../src/dev/DevRebuildQueue";

class ControlledRebuildHandler implements DevRebuildHandler {
  readonly handledRequests: DevRebuildRequest[] = [];
  private readonly pendingResolvers: Array<() => void> = [];
  private readonly runCountListeners = new Map<number, Array<() => void>>();

  async run(request: DevRebuildRequest): Promise<void> {
    this.handledRequests.push(request);
    this.notifyRunCountListeners();
    await new Promise<void>((resolve) => {
      this.pendingResolvers.push(resolve);
    });
  }

  async waitForRunCount(expectedRunCount: number): Promise<void> {
    if (this.handledRequests.length >= expectedRunCount) {
      return;
    }
    await new Promise<void>((resolve) => {
      const listeners = this.runCountListeners.get(expectedRunCount) ?? [];
      listeners.push(resolve);
      this.runCountListeners.set(expectedRunCount, listeners);
    });
  }

  releaseNext(): void {
    const resolver = this.pendingResolvers.shift();
    assert.ok(resolver, "Expected a queued rebuild to release.");
    resolver();
  }

  private notifyRunCountListeners(): void {
    const listeners = this.runCountListeners.get(this.handledRequests.length);
    if (!listeners) {
      return;
    }
    this.runCountListeners.delete(this.handledRequests.length);
    for (const listener of listeners) {
      listener();
    }
  }
}

test("DevRebuildQueue merges pending rebuilds while a rebuild is already running", async () => {
  const handler = new ControlledRebuildHandler();
  const queue = new DevRebuildQueue(handler);

  const firstDrain = queue.enqueue({
    changedPaths: ["/consumer/src/a.ts"],
    shouldRepublishConsumerOutput: false,
    shouldRestartUi: false,
  });
  const secondDrain = queue.enqueue({
    changedPaths: ["/consumer/src/b.ts"],
    shouldRepublishConsumerOutput: true,
    shouldRestartUi: false,
  });
  const thirdDrain = queue.enqueue({
    changedPaths: ["/consumer/src/c.ts"],
    shouldRepublishConsumerOutput: false,
    shouldRestartUi: true,
  });

  await handler.waitForRunCount(1);
  assert.equal(handler.handledRequests.length, 1);
  assert.deepEqual(handler.handledRequests[0]?.changedPaths, ["/consumer/src/a.ts"]);

  handler.releaseNext();
  await handler.waitForRunCount(2);
  assert.equal(handler.handledRequests.length, 2);
  assert.deepEqual(handler.handledRequests[1]?.changedPaths, ["/consumer/src/b.ts", "/consumer/src/c.ts"]);
  assert.equal(handler.handledRequests[1]?.shouldRepublishConsumerOutput, true);
  assert.equal(handler.handledRequests[1]?.shouldRestartUi, true);

  handler.releaseNext();
  await Promise.all([firstDrain, secondDrain, thirdDrain]);
  assert.equal(handler.handledRequests.length, 2);
});
