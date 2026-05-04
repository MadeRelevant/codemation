/**
 * Merges processed-ID windows for polling triggers, capping the total to avoid unbounded growth.
 * Plugin code receives an instance of this class via {@link PollingTriggerHandle.dedup}.
 */
export class PollingTriggerDedupWindow {
  static readonly defaultCapN = 2000;

  merge(
    previous: ReadonlyArray<string>,
    incoming: ReadonlyArray<string>,
    capN: number = PollingTriggerDedupWindow.defaultCapN,
  ): ReadonlyArray<string> {
    const merged = new Set(previous);
    for (const id of incoming) {
      merged.add(id);
    }
    const result = [...merged];
    if (result.length <= capN) {
      return result;
    }
    return result.slice(result.length - capN);
  }
}
