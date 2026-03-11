import { injectable } from "@codemation/core";
import { CodemationApp } from "../CodemationApp";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { CodemationPreparedExecutionRuntime } from "../codemationRuntimeContracts";
import type { PreparedExecutionRuntimeProvider } from "./frontendRouteTokens";

@injectable()
export class CodemationPreparedExecutionRuntimeProvider implements PreparedExecutionRuntimeProvider {
  async getPreparedExecutionRuntime(
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<CodemationPreparedExecutionRuntime> {
    return await CodemationApp.getPreparedExecutionRuntime(args);
  }
}
