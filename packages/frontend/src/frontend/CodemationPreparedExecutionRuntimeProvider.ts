import { injectable } from "@codemation/core";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import { codemationNextRuntimeRegistry, type CodemationPreparedExecutionRuntime } from "../runtime/codemationNextRuntimeRegistry";
import type { PreparedExecutionRuntimeProvider } from "./frontendRouteTokens";

@injectable()
export class CodemationPreparedExecutionRuntimeProvider implements PreparedExecutionRuntimeProvider {
  async getPreparedExecutionRuntime(
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<CodemationPreparedExecutionRuntime> {
    return await codemationNextRuntimeRegistry.getPreparedExecutionRuntime(args);
  }
}
