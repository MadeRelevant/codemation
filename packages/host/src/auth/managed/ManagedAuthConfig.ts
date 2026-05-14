/**
 * Env-derived configuration for managed auth mode.
 *
 * Required env vars when auth.kind === "managed":
 *   CONTROL_PLANE_JWKS_URL  — JWKS endpoint URL for the control plane
 *   CONTROL_PLANE_ISSUER    — expected JWT `iss` claim value
 *   CP_WEB_ORIGIN           — single-origin CORS allowlist for the CP browser UI
 */
export interface ManagedAuthConfig {
  readonly jwksUrl: string;
  readonly issuer: string;
  readonly cpWebOrigin: string;
}

export class ManagedAuthConfigFactory {
  create(env: Readonly<NodeJS.ProcessEnv>): ManagedAuthConfig {
    const jwksUrl = env["CONTROL_PLANE_JWKS_URL"];
    const issuer = env["CONTROL_PLANE_ISSUER"];
    const cpWebOrigin = env["CP_WEB_ORIGIN"];

    if (!jwksUrl || !issuer || !cpWebOrigin) {
      throw new Error(
        "ManagedAuthConfigFactory: CONTROL_PLANE_JWKS_URL, CONTROL_PLANE_ISSUER, and CP_WEB_ORIGIN are required in managed auth mode.",
      );
    }

    return { jwksUrl, issuer, cpWebOrigin };
  }
}
