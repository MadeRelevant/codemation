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

export interface CodemationPluginConfig {
  readonly pluginPackageId?: string;
  readonly credentialTypes?: ReadonlyArray<AnyCredentialType>;
  readonly register?: (context: CodemationPluginContext) => void | Promise<void>;
  readonly sandbox?: CodemationConfig;
}

export type CodemationPlugin = CodemationPluginConfig;

const definePlugin = <TConfig extends CodemationPluginConfig>(config: TConfig): TConfig => config;

export { definePlugin };

export class CodemationPluginPackageMetadata {
  private static readonly packageNameSymbol = Symbol.for("@codemation/plugin-package-name");

  attachPackageName(plugin: CodemationPlugin, packageName: string): CodemationPlugin {
    if (packageName.trim().length === 0) {
      return plugin;
    }
    const mutablePlugin = plugin as CodemationPlugin & {
      [CodemationPluginPackageMetadata.packageNameSymbol]?: string;
    };
    const existingPackageName = mutablePlugin[CodemationPluginPackageMetadata.packageNameSymbol];
    if (existingPackageName === packageName) {
      return plugin;
    }
    Object.defineProperty(mutablePlugin, CodemationPluginPackageMetadata.packageNameSymbol, {
      configurable: true,
      enumerable: false,
      value: packageName,
      writable: true,
    });
    return plugin;
  }

  readPackageName(plugin: CodemationPlugin): string | undefined {
    const packageName = (
      plugin as CodemationPlugin & {
        [CodemationPluginPackageMetadata.packageNameSymbol]?: unknown;
      }
    )[CodemationPluginPackageMetadata.packageNameSymbol];
    return typeof packageName === "string" && packageName.trim().length > 0 ? packageName : undefined;
  }
}
