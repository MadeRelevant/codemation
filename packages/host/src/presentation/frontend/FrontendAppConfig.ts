import type { CodemationFrontendAuthSnapshot } from "./CodemationFrontendAuthSnapshot";

/**
 * Frontend-safe projection of host app configuration for packaged Next UI and SSR.
 */
export type FrontendAppConfig = Readonly<{
  auth: CodemationFrontendAuthSnapshot;
  productName: string;
  logoUrl: string | null;
}>;
