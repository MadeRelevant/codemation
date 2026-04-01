import type { CodemationFrontendAuthProviderSnapshot } from "./CodemationFrontendAuthSnapshot";

/**
 * Frontend-safe runtime bootstrap consumed by the Next.js shell.
 */
export type PublicFrontendBootstrap = Readonly<{
  credentialsEnabled: boolean;
  logoUrl: string | null;
  oauthProviders: ReadonlyArray<CodemationFrontendAuthProviderSnapshot>;
  productName: string;
  uiAuthEnabled: boolean;
}>;
