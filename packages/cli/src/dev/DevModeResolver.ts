import type { DevMode } from "../commands/devCommandLifecycle.types";

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
