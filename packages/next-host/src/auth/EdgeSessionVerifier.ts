import { getToken } from "@auth/core/jwt";
import type { NextRequest } from "next/server";

export class EdgeSessionVerifier {
  static async hasAuthenticatedSession(request: NextRequest, secret: string | null): Promise<boolean> {
    if (!secret) {
      return false;
    }
    const token = await getToken({
      req: request,
      secret,
      salt: "authjs.session-token",
    });
    return token !== null;
  }
}
