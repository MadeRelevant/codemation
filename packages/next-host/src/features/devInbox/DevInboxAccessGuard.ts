import type { PairingConfig } from "@codemation/host/pairing";

/**
 * Determines whether the /dev/inbox route should render.
 *
 * Returns "not-found" in managed mode (PairingConfig present) so that
 * CP-paired deployments cannot access the local dev surface.
 */
export class DevInboxAccessGuard {
  check(pairingConfig: PairingConfig | null): "render" | "not-found" {
    return pairingConfig !== null ? "not-found" : "render";
  }
}

export const devInboxAccessGuard = new DevInboxAccessGuard();
