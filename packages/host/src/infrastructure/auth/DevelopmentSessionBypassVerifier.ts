import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import type { SessionVerifier } from "../../application/auth/SessionVerifier";

export class DevelopmentSessionBypassVerifier implements SessionVerifier {
  async verify(): Promise<AuthenticatedPrincipal | null> {
    return {
      id: "codemation-development-bypass",
      email: "development@codemation.local",
      name: "Development bypass user",
    };
  }
}
