import type { CodemationAuthConfig } from "../config/CodemationAuthConfig";

export type CodemationFrontendAuthProviderSnapshot = Readonly<{
  id: string;
  name: string;
}>;

export type CodemationFrontendAuthSnapshot = Readonly<{
  config: CodemationAuthConfig | undefined;
  credentialsEnabled: boolean;
  oauthProviders: ReadonlyArray<CodemationFrontendAuthProviderSnapshot>;
  secret: string | null;
  uiAuthEnabled: boolean;
}>;
