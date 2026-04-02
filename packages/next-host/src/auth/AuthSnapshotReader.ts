import { FrontendAppConfigJsonCodec, type CodemationFrontendAuthSnapshot } from "@codemation/host/client";

import { EdgeAuthConfigurationReader } from "./EdgeAuthConfigurationReader";

/**
 * Edge/runtime helper: builds a minimal {@link CodemationFrontendAuthSnapshot} from `process.env` when the full
 * consumer manifest is unavailable (middleware, Auth.js edge bundle).
 */
export class AuthSnapshotReader {
  static readFromEnvironment(env: NodeJS.ProcessEnv = process.env): CodemationFrontendAuthSnapshot | null {
    const fullSnapshot = new FrontendAppConfigJsonCodec().deserialize(env.CODEMATION_FRONTEND_APP_CONFIG_JSON)?.auth;
    if (fullSnapshot) {
      return fullSnapshot;
    }
    const edge = new EdgeAuthConfigurationReader().readFromEnvironment(env);
    return {
      config: undefined,
      credentialsEnabled: false,
      oauthProviders: [],
      secret: edge.authSecret,
      uiAuthEnabled: edge.uiAuthEnabled,
    };
  }
}
