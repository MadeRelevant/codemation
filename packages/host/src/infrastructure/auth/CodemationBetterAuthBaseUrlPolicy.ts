import type { Logger } from "../../application/logging/Logger";

/**
 * Centralizes how the host picks Better Auth's public origin.
 *
 * Better Auth needs one browser-facing origin for callback URLs, cookie scope, and redirect construction.
 * Codemation exposes two env vars in this area:
 * - `BETTER_AUTH_URL`: explicit Better Auth override
 * - `CODEMATION_PUBLIC_BASE_URL`: shared public origin used elsewhere in the host
 *
 * Keeping the precedence and warnings in one class prevents the host factory, docs, and tests from drifting.
 */
export class CodemationBetterAuthBaseUrlPolicy {
  constructor(private readonly logger: Logger) {}

  resolveOriginFromEnv(env: Readonly<NodeJS.ProcessEnv>): string | undefined {
    const betterRaw = env.BETTER_AUTH_URL?.trim();
    const publicRaw = env.CODEMATION_PUBLIC_BASE_URL?.trim();
    const betterOrigin = betterRaw ? this.tryParseOrigin(betterRaw) : undefined;
    const publicOrigin = publicRaw ? this.tryParseOrigin(publicRaw) : undefined;

    if (betterRaw && !betterOrigin) {
      this.logger.warn(
        `BETTER_AUTH_URL is set but could not be parsed as a URL origin ("${betterRaw}"). It will be ignored; fix the value or rely on CODEMATION_PUBLIC_BASE_URL.`,
      );
    }
    if (publicRaw && !publicOrigin) {
      this.logger.warn(
        `CODEMATION_PUBLIC_BASE_URL is set but could not be parsed as a URL origin ("${publicRaw}"). It will be ignored when resolving Better Auth baseURL.`,
      );
    }

    const chosen = betterOrigin ?? publicOrigin;

    if (betterOrigin && publicOrigin && betterOrigin !== publicOrigin) {
      this.logger.warn(
        `BETTER_AUTH_URL origin (${betterOrigin}) differs from CODEMATION_PUBLIC_BASE_URL origin (${publicOrigin}). Better Auth uses BETTER_AUTH_URL first; align both to the browser-facing origin to avoid OAuth redirects and cookie scope mismatches.`,
      );
    }

    if (!chosen && env.NODE_ENV === "production") {
      this.logger.warn(
        "Neither BETTER_AUTH_URL nor CODEMATION_PUBLIC_BASE_URL is set to a valid origin. Set BETTER_AUTH_URL (preferred) or CODEMATION_PUBLIC_BASE_URL to your public site URL in production so Better Auth can build correct OAuth and session URLs.",
      );
    }

    return chosen;
  }

  private tryParseOrigin(raw: string): string | undefined {
    try {
      const parsed = raw.includes("://") ? new URL(raw) : new URL(`http://${raw}`);
      return parsed.origin;
    } catch {
      return undefined;
    }
  }
}
