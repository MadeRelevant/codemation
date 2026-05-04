import { injectable } from "@codemation/core";

/** Mints opaque ids for `TestAssertion` rows. Each assertion item emitted on `main` gets one. */
@injectable()
export class TestAssertionIdFactory {
  makeAssertionId(): string {
    return `tas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
}
