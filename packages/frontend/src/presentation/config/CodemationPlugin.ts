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
  register(context: CodemationPluginContext): void | Promise<void>;
}
