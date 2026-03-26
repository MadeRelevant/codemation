import { injectable } from "@codemation/core";
import type { BootRuntimeSummary } from "./BootRuntimeSummary.types";

/**
 * Holds the latest {@link BootRuntimeSummary} after {@link CodemationApplication} prepare wiring.
 * Avoids injecting {@link CodemationApplication} into dev diagnostics (circular ESM graph with assembler).
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
