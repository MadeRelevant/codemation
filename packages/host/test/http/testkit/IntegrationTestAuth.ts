import type { CodemationAuthConfig } from "../../../src/presentation/config/CodemationAuthConfig";

/** Shared auth profile for HTTP integration tests (never use in production). */
export class IntegrationTestAuth {
  static readonly developmentBypass: CodemationAuthConfig = {
    kind: "local",
    allowUnauthenticatedInDevelopment: true,
  };
}
