import type { AnyCredentialType, Container } from "@codemation/core";
import type { LoggerFactory } from "../../application/logging/Logger";
import type { AppConfig } from "./AppConfig";
import type { CodemationRegistrationContextBase } from "./CodemationAppContext";
import type { CodemationConfig } from "./CodemationConfig";

export interface CodemationPluginContext extends CodemationRegistrationContextBase {
  readonly container: Container;
  readonly appConfig: AppConfig;
  readonly loggerFactory: LoggerFactory;
}

export interface CodemationPlugin {
  /**
   * Optional npm package name for this plugin (e.g. `"@codemation/core-nodes-gmail"`).
   * When set, the host merges configured and discovered plugin lists by this id so the same package is not
   * registered twice when separate module graphs load duplicate class instances (different `constructor` values).
   */
  readonly pluginPackageId?: string;
  /**
   * Optional dev-only config fragment merged when tooling synthesizes a consumer `codemation.config` from a plugin
   * (for example `codemation dev:plugin`).
   */
  readonly sandbox?: CodemationConfig;
  /**
   * Declarative companion to `registerCredentialType`; plugins created via `definePlugin` / `CodemationPluginDefinitionFactory`
   * populate this so tooling can introspect types without running `register`.
   */
  readonly credentialTypes?: ReadonlyArray<AnyCredentialType>;
  register(context: CodemationPluginContext): void | Promise<void>;
}
