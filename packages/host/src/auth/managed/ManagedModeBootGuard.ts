/**
 * Boot-time guard for `auth.kind: "managed"`.
 *
 * Validates that all required environment variables are present before the
 * container boots. Throws a descriptive error listing every missing variable
 * so operators can fix the config in one shot.
 */
export class ManagedModeBootGuard {
  private static readonly requiredVars: ReadonlyArray<string> = [
    "WORKSPACE_ID",
    "WORKSPACE_PAIRING_SECRET",
    "CONTROL_PLANE_URL",
    "CONTROL_PLANE_JWKS_URL",
    "CONTROL_PLANE_ISSUER",
    "CP_WEB_ORIGIN",
  ];

  assertRequiredEnv(env: Readonly<NodeJS.ProcessEnv>): void {
    const missing = ManagedModeBootGuard.requiredVars.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(
        `auth.kind "managed" requires the following environment variables which are not set: ${missing.join(", ")}.\n` +
          "Set all of them before starting in managed mode.",
      );
    }
  }
}
