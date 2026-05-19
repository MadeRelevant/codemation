import type { PairingConfig } from "./pairing.types";

/**
 * Reads pairing configuration from environment variables.
 *
 * Required env vars when pairing is enabled:
 *   WORKSPACE_ID               — the workspace's database ID
 *   WORKSPACE_PAIRING_SECRET   — base64-encoded 32-byte shared secret
 *   CONTROL_PLANE_URL          — base URL of the control plane API
 *
 * Returns null if any required variable is absent (pairing disabled).
 * See docs/pairing-protocol.md for full bootstrap instructions.
 */
export class PairingConfigFactory {
  create(env: Readonly<NodeJS.ProcessEnv>): PairingConfig | null {
    const workspaceId = env["WORKSPACE_ID"];
    const pairingSecret = env["WORKSPACE_PAIRING_SECRET"];
    const controlPlaneUrl = env["CONTROL_PLANE_URL"];

    if (!workspaceId || !pairingSecret || !controlPlaneUrl) {
      return null;
    }

    // eslint-disable-next-line codemation/no-buffer-everything -- pairing secret is always 32 bytes; bounded by validation below.
    const decoded = Buffer.from(pairingSecret, "base64");
    if (decoded.length !== 32) {
      throw new Error(
        `WORKSPACE_PAIRING_SECRET must be a base64-encoded 32-byte value (got ${decoded.length} bytes). ` +
          `Generate a valid secret with: openssl rand -base64 32`,
      );
    }

    return { workspaceId, pairingSecret, controlPlaneUrl };
  }
}
