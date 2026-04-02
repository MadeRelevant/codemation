import type { CodemationPlugin } from "../presentation/config/CodemationPlugin";
import type { CodemationPluginDefinitionArgs } from "../presentation/config/CodemationPluginDefinitionFactory";
import { CodemationPluginDefinitionFactory } from "../presentation/config/CodemationPluginDefinitionFactory";

export type { CodemationPlugin, CodemationPluginContext } from "../presentation/config/CodemationPlugin";
export { SandboxFactory } from "../presentation/config/SandboxFactory";
export type { SandboxFactoryOptions } from "../presentation/config/SandboxFactory";

export function definePlugin(args: CodemationPluginDefinitionArgs): CodemationPlugin {
  return CodemationPluginDefinitionFactory.createPlugin(args);
}
