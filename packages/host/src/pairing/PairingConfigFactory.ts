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

    return { workspaceId, pairingSecret, controlPlaneUrl };
  }
}
