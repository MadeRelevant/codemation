import type { CodemationAuthConfig } from "../config/CodemationAuthConfig";
import type { CodemationFrontendAuthProviderSnapshot } from "./CodemationFrontendAuthSnapshot";
import type { InternalAuthBootstrap } from "./InternalAuthBootstrap";

export class InternalAuthBootstrapJsonCodec {
  serialize(bootstrap: InternalAuthBootstrap): string {
    return JSON.stringify(bootstrap);
  }

  deserialize(serialized: string | undefined): InternalAuthBootstrap | null {
    if (!serialized || serialized.trim().length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(serialized) as Partial<InternalAuthBootstrap> | null;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return {
        authConfig: this.resolveAuthConfig(parsed.authConfig),
        credentialsEnabled: parsed.credentialsEnabled === true,
        oauthProviders: this.resolveOauthProviders(parsed.oauthProviders),
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
      return [{ id: provider.id, name: provider.name }];
    });
  }
}
