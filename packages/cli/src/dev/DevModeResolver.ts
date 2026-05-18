import type { DevMode } from "../commands/devCommandLifecycle.types";

// The CLI is a process entry point — env reads are legitimate here. The DI
// rule against `process.env` exists to keep library modules pure, not to ban
// it at the boundary.
/* eslint-disable no-restricted-properties */

export class DevModeResolver {
  resolve(args: Readonly<{ watchFramework?: boolean; apiOnly?: boolean }>): DevMode {
    if (args.apiOnly === true || process.env.CODEMATION_DEV_MODE === "api-only") {
      return "api-only";
    }
    if (args.watchFramework === true || process.env.CODEMATION_DEV_MODE === "framework") {
      return "watch-framework";
    }
    return "packaged-ui";
  }
}
