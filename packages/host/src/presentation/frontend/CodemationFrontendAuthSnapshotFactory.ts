import { injectable } from "@codemation/core";

import type { AppConfig } from "../config/AppConfig";
import type {
  CodemationAuthConfig,
  CodemationAuthOAuthProviderConfig,
  CodemationAuthOidcProviderConfig,
} from "../config/CodemationAuthConfig";

import type {
  CodemationFrontendAuthProviderSnapshot,
  CodemationFrontendAuthSnapshot,
} from "./CodemationFrontendAuthSnapshot";

@injectable()
export class CodemationFrontendAuthSnapshotFactory {
  createFromAppConfig(appConfig: AppConfig): CodemationFrontendAuthSnapshot {
    return this.createFromResolvedInputs({
      authConfig: appConfig.auth,
      env: appConfig.env,
      uiAuthEnabled: this.resolveUiAuthEnabled(appConfig.auth, appConfig.env),
    });
  }

  createFromResolvedInputs(
    args: Readonly<{
      authConfig: CodemationAuthConfig | undefined;
      env: NodeJS.ProcessEnv;
      uiAuthEnabled: boolean;
    }>,
  ): CodemationFrontendAuthSnapshot {
    return {
      config: args.authConfig,
      credentialsEnabled: args.authConfig?.kind === "local",
      oauthProviders: this.createOauthProviders(args.authConfig),
      secret: this.resolveAuthSecret(args.env),
      uiAuthEnabled: args.uiAuthEnabled,
    };
  }

  private resolveUiAuthEnabled(authConfig: CodemationAuthConfig | undefined, env: NodeJS.ProcessEnv): boolean {
    return !(env.NODE_ENV !== "production" && authConfig?.allowUnauthenticatedInDevelopment === true);
  }

  private resolveAuthSecret(env: NodeJS.ProcessEnv): string | null {
    const secret =
      env.AUTH_SECRET?.trim() ||
      (env.NODE_ENV === "development" ? "codemation-dev-auth-secret-not-for-production" : undefined);
    return secret && secret.trim().length > 0 ? secret : null;
  }

  private createOauthProviders(
    authConfig: CodemationAuthConfig | undefined,
  ): ReadonlyArray<CodemationFrontendAuthProviderSnapshot> {
    if (!authConfig) {
      return [];
    }
    const providers: CodemationFrontendAuthProviderSnapshot[] = [];
    for (const provider of authConfig.oauth ?? []) {
      providers.push(this.createOAuthProvider(provider));
    }
    for (const provider of authConfig.oidc ?? []) {
      providers.push(this.createOidcProvider(provider));
    }
    return providers;
  }

  private createOAuthProvider(provider: CodemationAuthOAuthProviderConfig): CodemationFrontendAuthProviderSnapshot {
    if (provider.provider === "google") {
      return { id: "google", name: "Google" };
    }
    if (provider.provider === "github") {
      return { id: "github", name: "GitHub" };
    }
    return { id: "microsoft-entra-id", name: "Microsoft" };
  }

  private createOidcProvider(provider: CodemationAuthOidcProviderConfig): CodemationFrontendAuthProviderSnapshot {
    return {
      id: provider.id,
      name: provider.id,
    };
  }
}
