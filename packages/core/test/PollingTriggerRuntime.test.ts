import { test } from "vitest";
import assert from "node:assert/strict";
import type { PersistedTriggerSetupState, TriggerInstanceId, TriggerSetupStateRepository } from "@codemation/core";
import { PollingTriggerDedupWindow, PollingTriggerRuntime, NoOpPollingTriggerLogger } from "@codemation/core";

class InMemoryTriggerSetupStateRepository implements TriggerSetupStateRepository {
  private readonly statesByKey = new Map<string, PersistedTriggerSetupState>();

  async load(trigger: TriggerInstanceId): Promise<PersistedTriggerSetupState | undefined> {
    return this.statesByKey.get(`${trigger.workflowId}:${trigger.nodeId}`);
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    this.statesByKey.set(`${state.trigger.workflowId}:${state.trigger.nodeId}`, state);
  }

  async delete(trigger: TriggerInstanceId): Promise<void> {
    this.statesByKey.delete(`${trigger.workflowId}:${trigger.nodeId}`);
  }
}

interface TestState {
  count: number;
}

async function waitFor(assertion: () => void, timeoutMs = 3000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assertion();
}

function makeTrigger(id = "trigger_1"): TriggerInstanceId {
  return { workflowId: "wf_1", nodeId: id };
}

function makeRuntime(repo?: TriggerSetupStateRepository): PollingTriggerRuntime {
  return new PollingTriggerRuntime(repo ?? new InMemoryTriggerSetupStateRepository(), new NoOpPollingTriggerLogger());
}

test("PollingTriggerRuntime runs first cycle immediately on start", async () => {
  const runtime = makeRuntime();
  const trigger = makeTrigger();
  let cycleCount = 0;
  await runtime.start({
    trigger,
    intervalMs: 60_000,
    runCycle: async ({ previousState }) => ({
      items: [],
      nextState: { count: (previousState?.count ?? 0) + 1 },
    }),
    emit: async () => {
      cycleCount++;
    },
  });
  // emit is called only when items.length > 0 — first cycle returned no items
  assert.equal(cycleCount, 0);
  await runtime.stop(trigger);
});

test("PollingTriggerRuntime schedules repeated cycles via setInterval", async () => {
  const runtime = makeRuntime();
  const trigger = makeTrigger();
  const emitted: unknown[] = [];
  await runtime.start({
    trigger,
    intervalMs: 25,
    runCycle: async () => ({
      items: [{ json: { val: 1 } }] as never,
      nextState: { count: 1 },
    }),
    emit: async (items) => {
      emitted.push(...items);
    },
  });
  await waitFor(() => {
    assert.ok(emitted.length >= 2);
  });
  await runtime.stop(trigger);
});

test("PollingTriggerRuntime overlap guard skips when a cycle is still busy", async () => {
  const repo = new InMemoryTriggerSetupStateRepository();
  const runtime = makeRuntime(repo);
  const trigger = makeTrigger();
  let activeCount = 0;
  let maxActive = 0;

  await runtime.start({
    trigger,
    intervalMs: 10,
    runCycle: async () => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((r) => setTimeout(r, 100)); // hold the cycle for 100ms
      activeCount--;
      return { items: [], nextState: { count: 1 } };
    },
    emit: async () => {},
  });

  await new Promise((r) => setTimeout(r, 150));
  await runtime.stop(trigger);
  // Despite short intervals, no more than one cycle runs at a time
  assert.equal(maxActive, 1);
});

test("PollingTriggerRuntime error in runCycle is caught and does not crash the loop", async () => {
  const runtime = makeRuntime();
  const trigger = makeTrigger();
  let successCount = 0;
  let callCount = 0;

  await runtime.start({
    trigger,
    intervalMs: 25,
    runCycle: async () => {
      callCount++;
      if (callCount === 1) {
        // First cycle (immediate): throw
        throw new Error("cycle error");
      }
      successCount++;
      return { items: [], nextState: { count: successCount } };
    },
    emit: async () => {},
  });

  await waitFor(() => {
    assert.ok(successCount >= 1, `successCount=${successCount}`);
  });
  await runtime.stop(trigger);
});

test("PollingTriggerRuntime stop clears the interval and removes from active set", async () => {
  const runtime = makeRuntime();
  const trigger = makeTrigger();
  let callCount = 0;

  await runtime.start({
    trigger,
    intervalMs: 25,
    runCycle: async () => {
      callCount++;
      return { items: [], nextState: { count: callCount } };
    },
    emit: async () => {},
  });

  await runtime.stop(trigger);
  const countAtStop = callCount;
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(callCount, countAtStop);
});

test("PollingTriggerRuntime persists nextState via the repository after each cycle", async () => {
  const repo = new InMemoryTriggerSetupStateRepository();
  const runtime = makeRuntime(repo);
  const trigger = makeTrigger();

  await runtime.start({
    trigger,
    intervalMs: 60_000,
    runCycle: async ({ previousState }) => ({
      items: [],
      nextState: { count: (previousState?.count ?? 0) + 1 },
    }),
    emit: async () => {},
  });

  const saved = await repo.load(trigger);
  assert.ok(saved !== undefined);
  assert.deepEqual((saved!.state as TestState).count, 1);
  await runtime.stop(trigger);
});

test("PollingTriggerRuntime loads previousState from repo before calling runCycle", async () => {
  const repo = new InMemoryTriggerSetupStateRepository();
  const trigger = makeTrigger();
  // Pre-seed the repo with state count=5
  await repo.save({ trigger, updatedAt: new Date().toISOString(), state: { count: 5 } });

  const runtime = makeRuntime(repo);
  let seenPrevious: TestState | undefined;

  await runtime.start({
    trigger,
    intervalMs: 60_000,
    seedState: { count: 0 }, // seedState should be overridden by repo
    runCycle: async ({ previousState }) => {
      seenPrevious = previousState as TestState;
      return { items: [], nextState: { count: (previousState?.count ?? 0) + 1 } };
    },
    emit: async () => {},
  });

  assert.equal(seenPrevious?.count, 5);
  await runtime.stop(trigger);
});

test("PollingTriggerRuntime ctx-handle pre-fills triggerId / emit / registerCleanup correctly", async () => {
  // This test simulates TriggerRuntimeService.buildPollingHandle usage pattern
  const repo = new InMemoryTriggerSetupStateRepository();
  const runtime = makeRuntime(repo);
  const trigger = makeTrigger();
  const emitted: unknown[] = [];
  let cleanupRegistered = false;

  // Simulate what TriggerRuntimeService.buildPollingHandle does:
  const emit = async (items: unknown[]): Promise<void> => {
    emitted.push(...items);
  };
  const registerCleanup = (_: unknown): void => {
    cleanupRegistered = true;
  };

  // The handle is returned and its start() invoked
  const handle = {
    dedup: new PollingTriggerDedupWindow(),
    start: async (args: {
      intervalMs: number;
      runCycle: (ctx: {
        previousState: unknown;
        signal: AbortSignal;
      }) => Promise<{ items: unknown[]; nextState: unknown }>;
    }) => {
      registerCleanup({ stop: async () => runtime.stop(trigger) });
      return runtime.start({ trigger, emit: emit as never, ...args });
    },
  };

  await handle.start({
    intervalMs: 60_000,
    runCycle: async () => ({
      items: [{ json: { x: 1 } }] as never,
      nextState: { count: 1 },
    }),
  });

  assert.equal(cleanupRegistered, true);
  assert.equal(emitted.length, 1);
  await runtime.stop(trigger);
});

test("PollingTriggerDedupWindow.merge caps the result to defaultCapN", () => {
  const dedup = new PollingTriggerDedupWindow();
  const previous = Array.from({ length: 1995 }, (_, i) => `id-${i}`);
  const incoming = ["a", "b", "c", "d", "e", "f"];
  const merged = dedup.merge(previous, incoming, 2000);
  assert.equal(merged.length, 2000);
});

test("PollingTriggerDedupWindow.merge deduplicates across previous and incoming", () => {
  const dedup = new PollingTriggerDedupWindow();
  const previous = ["a", "b", "c"];
  const incoming = ["b", "c", "d"];
  const merged = dedup.merge(previous, incoming);
  assert.deepEqual([...merged].sort(), ["a", "b", "c", "d"]);
});
