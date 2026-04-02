import type { AnyCredentialType } from "@codemation/core";

import type { CodemationConfig } from "./CodemationConfig";
import type { CodemationPlugin, CodemationPluginContext } from "./CodemationPlugin";

export type CodemationPluginDefinitionArgs = Readonly<{
  register: (context: CodemationPluginContext) => void | Promise<void>;
  /** Merged into generated consumer config for `codemation dev:plugin`. */
  sandbox?: CodemationConfig;
  /** Registered up-front via {@link CodemationPluginContext.registerCredentialType} before `register` runs. */
  credentialTypes?: ReadonlyArray<AnyCredentialType>;
  pluginPackageId?: string;
}>;

/**
 * Wraps plugin registration so credential types and sandbox metadata can live next to `register` with one export.
 */
export class CodemationPluginDefinitionFactory {
  static createPlugin(args: CodemationPluginDefinitionArgs): CodemationPlugin {
    const credentialTypes = [...(args.credentialTypes ?? [])];
    return {
      pluginPackageId: args.pluginPackageId,
      sandbox: args.sandbox,
      credentialTypes,
      register: async (context) => {
        for (const credentialType of credentialTypes) {
          context.registerCredentialType(credentialType);
        }
        await args.register(context);
      },
    };
  }
}
