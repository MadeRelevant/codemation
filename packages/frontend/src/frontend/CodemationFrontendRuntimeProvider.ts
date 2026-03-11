import { injectable } from "@codemation/core";
import { CodemationApp } from "../CodemationApp";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { CodemationFrontendRuntimeRoot } from "../runtime/codemationFrontendRuntimeRoot";
import type { FrontendRuntimeProvider } from "./frontendRouteTokens";

@injectable()
export class CodemationFrontendRuntimeProvider implements FrontendRuntimeProvider {
  async getRuntime(
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<CodemationFrontendRuntimeRoot> {
    return await CodemationApp.getRuntime(args);
  }
}
