import { inject, injectable } from "@codemation/core";
import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import type { SessionVerifier } from "../../application/auth/SessionVerifier";
import { AuthJsSessionVerifier } from "./AuthJsSessionVerifier";

@injectable()
export class CodemationSessionVerifier implements SessionVerifier {
  constructor(@inject(AuthJsSessionVerifier) private readonly authJsSessionVerifier: AuthJsSessionVerifier) {}

  async verify(request: Request): Promise<AuthenticatedPrincipal | null> {
    return await this.authJsSessionVerifier.verify(request);
  }
}
