import type { PublicFrontendBootstrap } from "./PublicFrontendBootstrap";
import type { CodemationFrontendAuthProviderSnapshot } from "./CodemationFrontendAuthSnapshot";

export class PublicFrontendBootstrapJsonCodec {
  serialize(bootstrap: PublicFrontendBootstrap): string {
    return JSON.stringify(bootstrap);
  }

  deserialize(serialized: string | undefined): PublicFrontendBootstrap | null {
    if (!serialized || serialized.trim().length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(serialized) as Partial<PublicFrontendBootstrap> | null;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return {
        credentialsEnabled: parsed.credentialsEnabled === true,
        logoUrl: typeof parsed.logoUrl === "string" && parsed.logoUrl.trim().length > 0 ? parsed.logoUrl : null,
        oauthProviders: this.resolveOauthProviders(parsed.oauthProviders),
        productName:
          typeof parsed.productName === "string" && parsed.productName.trim().length > 0
            ? parsed.productName
            : "Codemation",
        uiAuthEnabled: parsed.uiAuthEnabled !== false,
      };
    } catch {
      return null;
    }
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
