import { injectable } from "@codemation/core";
import type { CodemationBootContext, CodemationBootHook } from "@codemation/host";

@injectable()
export class E2eBootHook implements CodemationBootHook {
  async boot(_context: CodemationBootContext): Promise<void> {
    // Intentionally minimal: e2e workflows do not require seeded credentials.
  }
}
