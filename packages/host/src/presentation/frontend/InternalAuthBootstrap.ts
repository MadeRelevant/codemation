import type { CodemationAuthConfig } from "../config/CodemationAuthConfig";
import type { CodemationFrontendAuthProviderSnapshot } from "./CodemationFrontendAuthSnapshot";

/**
 * Node-side runtime bootstrap for NextAuth provider wiring.
 */
export type InternalAuthBootstrap = Readonly<{
  authConfig: CodemationAuthConfig | undefined;
  credentialsEnabled: boolean;
  oauthProviders: ReadonlyArray<CodemationFrontendAuthProviderSnapshot>;
  uiAuthEnabled: boolean;
}>;
