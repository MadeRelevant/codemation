import type { InternalAuthBootstrap } from "@codemation/host/client";

import { CodemationRuntimeBootstrapClient } from "../bootstrap/CodemationRuntimeBootstrapClient";
import { EdgeAuthConfigurationReader } from "./EdgeAuthConfigurationReader";

export class AuthSnapshotResolver {
  private static readonly edgeAuthConfigurationReader = new EdgeAuthConfigurationReader();
  private static readonly runtimeBootstrapClient = new CodemationRuntimeBootstrapClient();

  static async resolve(): Promise<InternalAuthBootstrap> {
    return await AuthSnapshotResolver.runtimeBootstrapClient.getInternalAuthBootstrap();
  }

  static resolveAuthSecret(env: NodeJS.ProcessEnv = process.env): string | null {
    return AuthSnapshotResolver.edgeAuthConfigurationReader.readFromEnvironment(env).authSecret;
  }
}
