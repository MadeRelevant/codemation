import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Paths and conventions for Playwright + the `@codemation/e2e-app` consumer (`apps/e2e`).
 * Use this when adding new e2e specs or alternate consumer roots / env overlays.
 */
export class CodemationPlaywrightHarness {
  static resolveRepoRoot(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(here, "../../../../..");
  }

  /** Default consumer app for browser e2e (see `apps/e2e`). */
  static defaultConsumerRoot(): string {
    return path.join(this.resolveRepoRoot(), "apps/e2e");
  }

  /**
   * Environment merged into the dev server for e2e: PostgreSQL, no Redis/BullMQ, enforced login
   * (the e2e consumer always disables dev auth bypass).
   */
  static baselineServerEnv(): NodeJS.ProcessEnv {
    return {
      CODEMATION_DEV_MODE: "framework",
      PORT: "3001",
    };
  }
}
