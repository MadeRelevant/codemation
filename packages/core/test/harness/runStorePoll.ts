import type { RunStateStore } from "../../src/index.ts";

/**
 * Spins the microtask queue until the run is pending on {@link nodeId}, or {@link maxSpins} is reached.
 * Avoids wall-clock time so tests stay deterministic under ESLint `Date.now` restrictions.
 */
export async function pollRunStoreUntilPendingNode(
  runStore: RunStateStore,
  runId: string,
  nodeId: string,
  maxSpins = 10_000,
): Promise<void> {
  let spins = 0;
  let s = await runStore.load(runId);
  while (s?.pending?.nodeId !== nodeId && spins < maxSpins) {
    spins += 1;
    await new Promise<void>((resolve) => setImmediate(resolve));
    s = await runStore.load(runId);
  }
}
