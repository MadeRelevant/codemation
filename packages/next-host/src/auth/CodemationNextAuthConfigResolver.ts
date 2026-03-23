import type { CodemationAuthConfig } from "@codemation/host";

export class CodemationNextAuthConfigResolver {
  async resolve(): Promise<CodemationAuthConfig | undefined> {
    const serialized = process.env.CODEMATION_AUTH_CONFIG_JSON;
    if (serialized && serialized.trim().length > 0) {
      const parsed = JSON.parse(serialized) as CodemationAuthConfig | null;
      return parsed ?? undefined;
    }
    const { CodemationNextHost } = await import("../server/CodemationNextHost");
    const context = await CodemationNextHost.shared.prepare();
    return context.authConfig;
  }
}
