import type { AuthenticatedPrincipal } from "./AuthenticatedPrincipal";

export interface SessionVerifier {
  verify(request: Request): Promise<AuthenticatedPrincipal | null>;
}
