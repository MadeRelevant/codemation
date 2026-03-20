import type { PersistedRunState } from "./runTypes";

type RunFinishedAtSource = Pick<PersistedRunState, "status" | "nodeSnapshotsByNodeId">;

/** Derives workflow end time from node snapshots for run listings. */
export class RunFinishedAtFactory {
  static resolveIso(state: RunFinishedAtSource): string | undefined {
    if (state.status === "running" || state.status === "pending") {
      return undefined;
    }
    let max: string | undefined;
    for (const snap of Object.values(state.nodeSnapshotsByNodeId)) {
      if (snap?.finishedAt && (!max || snap.finishedAt > max)) {
        max = snap.finishedAt;
      }
    }
    return max;
  }
}
