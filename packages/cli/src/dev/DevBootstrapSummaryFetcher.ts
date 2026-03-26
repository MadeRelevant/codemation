import type { DevBootstrapSummaryJson } from "@codemation/host/next/server";

/**
 * Fetches {@link DevBootstrapSummaryJson} from the dev gateway (proxied to runtime-dev).
 */
export class DevBootstrapSummaryFetcher {
  async fetch(gatewayBaseUrl: string): Promise<DevBootstrapSummaryJson | null> {
    const normalized = gatewayBaseUrl.replace(/\/$/, "");
    const response = await fetch(`${normalized}/api/dev/bootstrap-summary`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as DevBootstrapSummaryJson;
  }
}
