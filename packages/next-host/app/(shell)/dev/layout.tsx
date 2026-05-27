import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { resolvePairingConfig } from "../../../src/server/devInboxComposition";
import { devInboxAccessGuard } from "../../../src/features/devInbox/DevInboxAccessGuard";

/**
 * Layout for all /dev/* routes. Returns 404 in managed mode (PairingConfig present)
 * so that CP-paired deployments cannot accidentally expose the local dev surface.
 */
export default async function DevLayout({ children }: Readonly<{ children: ReactNode }>) {
  const pairingConfig = await resolvePairingConfig();
  const access = devInboxAccessGuard.check(pairingConfig);
  if (access === "not-found") {
    notFound();
  }
  return <>{children}</>;
}
