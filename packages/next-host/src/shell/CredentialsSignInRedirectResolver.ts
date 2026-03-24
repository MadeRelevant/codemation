import type { SignInResponse } from "next-auth/react";

/**
 * Maps NextAuth `signIn(..., { redirect: false })` outcomes to a browser navigation target.
 * Auth.js may return `ok: true` with an empty or missing `url` on success; callers must fall back to `callbackUrl`.
 */
export class CredentialsSignInRedirectResolver {
  static resolveRedirectUrl(result: SignInResponse, callbackUrl: string): string | null {
    if (result.error) {
      return null;
    }
    const trimmed = result.url?.trim();
    if (trimmed && trimmed.length > 0) {
      return trimmed;
    }
    if (result.ok) {
      return callbackUrl;
    }
    return null;
  }
}
