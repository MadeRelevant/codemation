import type { Container, InjectionToken } from "@codemation/core";
import type { CodemationBootstrapResult, CodemationDiscoveredApplicationSetup } from "./bootstrapDiscovery";
import { CodemationApplication } from "./codemationApplication";
import type { CodemationPreparedExecutionRuntime } from "./codemationRuntimeContracts";
import type { CodemationFrontendRuntimeRoot } from "./runtime/codemationFrontendRuntimeRoot";
import { CodemationRuntimeRegistry } from "./runtime/codemationRuntimeRegistry";

type RuntimeAccessArgs = Readonly<{ configOverride?: CodemationBootstrapResult }>;

export class CodemationApp {
  private static readonly runtimeRegistry = new CodemationRuntimeRegistry();

  static async getSetup(args?: RuntimeAccessArgs): Promise<CodemationDiscoveredApplicationSetup> {
    return await this.runtimeRegistry.getSetup(args);
  }

  static async getApplication(args?: RuntimeAccessArgs): Promise<CodemationApplication> {
    return (await this.getSetup(args)).application;
  }

  static async getContainer(args?: RuntimeAccessArgs): Promise<Container> {
    return (await this.getApplication(args)).getContainer();
  }

  static async resolve<T>(token: InjectionToken<T>, args?: RuntimeAccessArgs): Promise<T> {
    return (await this.getContainer(args)).resolve<T>(token) as T;
  }

  static async getRuntime(args?: RuntimeAccessArgs): Promise<CodemationFrontendRuntimeRoot> {
    return await this.runtimeRegistry.getRuntime(args);
  }

  static async getPreparedExecutionRuntime(args?: RuntimeAccessArgs): Promise<CodemationPreparedExecutionRuntime> {
    return await this.runtimeRegistry.getPreparedExecutionRuntime(args);
  }
}
