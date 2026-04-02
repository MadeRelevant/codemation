import type { AnyCredentialType, Container } from "@codemation/core";
import type { LoggerFactory } from "../../application/logging/Logger";
import type { AppConfig } from "./AppConfig";
import type { CodemationRegistrationContextBase } from "./CodemationAppContext";
import type { CodemationConfig } from "./CodemationConfig";

export type CodemationPluginSandbox = Readonly<{
  /**
   * Dev-only environment defaults applied by tooling that synthesizes a consumer config from a plugin.
   * Explicit shell env always wins; these values fill gaps for local plugin development.
   */
  env?: Readonly<Record<string, string>>;
  /** Config fragment merged into the generated consumer config for `codemation dev:plugin`. */
  config: CodemationConfig;
}>;

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
  readonly sandbox?: CodemationPluginSandbox;
  /**
   * Declarative companion to `registerCredentialType`; plugins created via `definePlugin` / `CodemationPluginDefinitionFactory`
   * populate this so tooling can introspect types without running `register`.
   */
  readonly credentialTypes?: ReadonlyArray<AnyCredentialType>;
  register(context: CodemationPluginContext): void | Promise<void>;
}
