import type { CodemationAuthConfig } from "../config/CodemationAuthConfig";
import type { FrontendAppConfig } from "./FrontendAppConfig";
import type { CodemationFrontendAuthProviderSnapshot } from "./CodemationFrontendAuthSnapshot";

export class FrontendAppConfigJsonCodec {
  serialize(config: FrontendAppConfig): string {
    return JSON.stringify(config);
  }

  deserialize(serialized: string | undefined): FrontendAppConfig | null {
    if (!serialized || serialized.trim().length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(serialized) as Partial<FrontendAppConfig> | null;
      if (!parsed || typeof parsed !== "object" || !parsed.auth || typeof parsed.auth !== "object") {
        return null;
      }
      return {
        auth: {
          config: this.resolveAuthConfig(parsed.auth.config),
          credentialsEnabled: parsed.auth.credentialsEnabled === true,
          oauthProviders: this.resolveOauthProviders(parsed.auth.oauthProviders),
          secret:
            typeof parsed.auth.secret === "string" && parsed.auth.secret.trim().length > 0 ? parsed.auth.secret : null,
          uiAuthEnabled: parsed.auth.uiAuthEnabled !== false,
        },
        productName:
          typeof parsed.productName === "string" && parsed.productName.trim().length > 0
            ? parsed.productName
            : "Codemation",
        logoUrl: typeof parsed.logoUrl === "string" && parsed.logoUrl.trim().length > 0 ? parsed.logoUrl : null,
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
      return [{ id: provider.id, name: provider.name }];
    });
  }
}
