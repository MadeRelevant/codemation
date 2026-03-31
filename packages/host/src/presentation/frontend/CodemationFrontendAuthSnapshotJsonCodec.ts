import type { CodemationAuthConfig } from "../config/CodemationAuthConfig";

import type {
  CodemationFrontendAuthProviderSnapshot,
  CodemationFrontendAuthSnapshot,
} from "./CodemationFrontendAuthSnapshot";

export class CodemationFrontendAuthSnapshotJsonCodec {
  serialize(snapshot: CodemationFrontendAuthSnapshot): string {
    return JSON.stringify(snapshot);
  }

  deserialize(serialized: string | undefined): CodemationFrontendAuthSnapshot | null {
    if (!serialized || serialized.trim().length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(serialized) as Partial<CodemationFrontendAuthSnapshot> | null;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return {
        config: this.resolveAuthConfig(parsed.config),
        credentialsEnabled: parsed.credentialsEnabled === true,
        oauthProviders: this.resolveOauthProviders(parsed.oauthProviders),
        secret: typeof parsed.secret === "string" && parsed.secret.trim().length > 0 ? parsed.secret : null,
        uiAuthEnabled: parsed.uiAuthEnabled !== false,
      };
    } catch {
      return null;
    }
  }

  private resolveAuthConfig(value: unknown): CodemationAuthConfig | undefined {
    return value && typeof value === "object" ? (value as CodemationAuthConfig) : undefined;
  }

  private resolveOauthProviders(value: unknown): ReadonlyArray<CodemationFrontendAuthProviderSnapshot> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const provider = entry as Partial<CodemationFrontendAuthProviderSnapshot>;
      if (typeof provider.id !== "string" || typeof provider.name !== "string") {
        return [];
      }
      return [
        {
          id: provider.id,
          name: provider.name,
        },
      ];
    });
  }
}
