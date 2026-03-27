import type { CodemationConfig } from "@codemation/host";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";

import type { CodemationWhitelabelSnapshot } from "./CodemationWhitelabelSnapshot";

/**
 * Builds shell branding from the consumer `codemation.config` object (same source as {@link CodemationApplication.useConfig}).
 */
export class CodemationWhitelabelSnapshotFactory {
  static fromConsumerConfig(config: CodemationConfig): CodemationWhitelabelSnapshot {
    const w = config.whitelabel;
    const rawName = w?.productName?.trim();
    const productName = rawName !== undefined && rawName.length > 0 ? rawName : "Codemation";
    const logoPath = w?.logoPath?.trim();
    const logoUrl = logoPath !== undefined && logoPath.length > 0 ? ApiPaths.whitelabelLogo() : null;
    return { productName, logoUrl };
  }
}
