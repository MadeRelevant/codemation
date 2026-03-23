import type { Container } from "@codemation/core";
import type { LoggerFactory } from "../../application/logging/Logger";
import type { CodemationApplication } from "../../codemationApplication";

export interface CodemationPluginContext {
  readonly application: CodemationApplication;
  readonly container: Container;
  readonly loggerFactory: LoggerFactory;
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly workflowSources: ReadonlyArray<string>;
}

export interface CodemationPlugin {
  /**
   * Optional npm package name for this plugin (e.g. `"@codemation/core-nodes-gmail"`).
   * When set, the host merges configured and discovered plugin lists by this id so the same package is not
   * registered twice when separate module graphs load duplicate class instances (different `constructor` values).
   */
  readonly pluginPackageId?: string;
  register(context: CodemationPluginContext): void | Promise<void>;
}
