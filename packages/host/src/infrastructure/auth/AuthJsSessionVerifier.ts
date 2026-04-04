import { getToken } from "@auth/core/jwt";
import type { AuthenticatedPrincipal } from "../../application/auth/AuthenticatedPrincipal";
import type { SessionVerifier } from "../../application/auth/SessionVerifier";
import type { SecureRequestDetector } from "./SecureRequestDetector";

export class AuthJsSessionVerifier implements SessionVerifier {
  constructor(
    private readonly authSecret: string,
    private readonly secureRequestDetector: SecureRequestDetector,
  ) {}

  async verify(request: Request): Promise<AuthenticatedPrincipal | null> {
    const secureCookie = this.secureRequestDetector.isSecureRequest(request);
    const token = await getToken({
      req: request,
      secret: this.authSecret,
      secureCookie,
      salt: "authjs.session-token",
    });
    if (!token?.sub || typeof token.sub !== "string") {
      return null;
    }
    return {
      id: token.sub,
      email: typeof token.email === "string" ? token.email : null,
      name: typeof token.name === "string" ? token.name : null,
    };
  }
}
