import { inject, injectable } from "@codemation/core";
import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import type { SessionVerifier } from "../../application/auth/SessionVerifier";
import { BetterAuthApiSessionVerifier } from "./BetterAuthApiSessionVerifier";

@injectable()
export class CodemationSessionVerifier implements SessionVerifier {
  constructor(
    @inject(BetterAuthApiSessionVerifier) private readonly betterAuthApiSessionVerifier: BetterAuthApiSessionVerifier,
  ) {}

  async verify(request: Request): Promise<AuthenticatedPrincipal | null> {
    return await this.betterAuthApiSessionVerifier.verify(request);
  }
}
