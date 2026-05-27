/**
 * Server-side composition helpers for the /dev/inbox route.
 *
 * These are thin async functions that resolve services from the shared
 * CodemationNextHost DI container. They are server-only — never imported
 * into client components.
 */
import { HumanTaskStoreToken } from "@codemation/core";
import type { HumanTaskRecord, HumanTaskStore } from "@codemation/core";
import { PairingConfigToken } from "@codemation/host/pairing";
import type { PairingConfig } from "@codemation/host/pairing";
import { CodemationNextHost } from "./CodemationNextHost";

export async function resolvePairingConfig(): Promise<PairingConfig | null> {
  const container = await CodemationNextHost.shared.getContainer();
  if (!container.isRegistered(PairingConfigToken, true)) {
    return null;
  }
  return (container.resolve(PairingConfigToken) as PairingConfig | undefined) ?? null;
}

export async function resolveHumanTaskStore(): Promise<HumanTaskStore> {
  const container = await CodemationNextHost.shared.getContainer();
  const store = container.resolve(HumanTaskStoreToken) as HumanTaskStore | undefined;
  if (!store) {
    throw new Error("HumanTaskStore is not registered. Ensure the host is configured with database persistence.");
  }
  return store;
}

export type { HumanTaskRecord };
