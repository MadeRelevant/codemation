import { injectable } from "@codemation/core";
import type { BootRuntimeSummary } from "./BootRuntimeSummary.types";

/**
 * Holds the latest {@link BootRuntimeSummary} after app container creation.
 * Avoids injecting container-building services into dev diagnostics.
 */
@injectable()
export class BootRuntimeSnapshotHolder {
  private snapshot: BootRuntimeSummary | null = null;

  set(snapshot: BootRuntimeSummary | null): void {
    this.snapshot = snapshot;
  }

  get(): BootRuntimeSummary | null {
    return this.snapshot;
  }
}
