import type { Container } from "@codemation/core";
import type { LoggerFactory } from "../../application/logging/Logger";
import type { AppConfig } from "../../presentation/config/AppConfig";
import type { CodemationPlugin } from "../../presentation/config/CodemationPlugin";
import type { AnyCredentialType } from "@codemation/core";

export class CodemationPluginRegistrar {
  async apply(
    args: Readonly<{
      plugins: ReadonlyArray<CodemationPlugin>;
      container: Container;
      appConfig: AppConfig;
      registerCredentialType: (type: AnyCredentialType) => void;
      loggerFactory: LoggerFactory;
    }>,
  ): Promise<void> {
    for (const plugin of args.plugins) {
      for (const credentialType of plugin.credentialTypes ?? []) {
        args.registerCredentialType(credentialType);
      }
      if (!plugin.register) {
        continue;
      }
      await plugin.register({
        container: args.container,
        appConfig: args.appConfig,
        loggerFactory: args.loggerFactory,
        registerCredentialType: (type) => args.registerCredentialType(type),
        registerNode: (token, implementation) => {
          args.container.registerSingleton(token as never, (implementation ?? token) as never);
        },
        registerValue: (token, value) => {
          args.container.registerInstance(token, value);
        },
        registerClass: (token, implementation) => {
          args.container.registerSingleton(token as never, implementation as never);
        },
        registerFactory: (token, factory) => {
          args.container.register(token, {
            useFactory: (dependencyContainer) => factory(dependencyContainer),
          });
        },
      });
    }
  }
}
