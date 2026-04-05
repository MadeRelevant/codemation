import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";

import type { AppConfig } from "../../presentation/config/AppConfig";
import type {
  CodemationAuthConfig,
  CodemationAuthOidcProviderConfig,
} from "../../presentation/config/CodemationAuthConfig";
import type { UserAccountSessionPolicy } from "../../domain/users/UserAccountSessionPolicy";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { CodemationBetterAuthBcryptPasswordCodec } from "./CodemationBetterAuthBcryptPasswordCodec";
import { CodemationBetterAuthDatabaseOptionsFactory } from "./CodemationBetterAuthDatabaseOptionsFactory";
import { PrismaUserAccountSessionEligibilityChecker } from "./PrismaUserAccountSessionEligibilityChecker";
import { CodemationBetterAuthBaseUrlPolicy } from "./CodemationBetterAuthBaseUrlPolicy";

/**
 * Builds the Better Auth server instance. Codemation auth config uses Better Auth's
 * social provider ids directly so this factory can pass them through without a translation layer.
 */
export class CodemationBetterAuthServerFactory {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly databaseOptionsFactory: CodemationBetterAuthDatabaseOptionsFactory,
    private readonly bcryptPasswordCodec: CodemationBetterAuthBcryptPasswordCodec,
    private readonly accountSessionPolicy: UserAccountSessionPolicy,
    private readonly betterAuthBaseUrlPolicy: CodemationBetterAuthBaseUrlPolicy,
  ) {}

  create(prisma: PrismaDatabaseClient): ReturnType<typeof betterAuth> {
    const sessionEligibility = new PrismaUserAccountSessionEligibilityChecker(prisma, this.accountSessionPolicy);
    const adapter = this.databaseOptionsFactory.createPrismaAdapterFactory(prisma, this.appConfig.env);
    const authConfig = this.appConfig.auth;
    const modelSlice = this.databaseOptionsFactory.buildDatabaseModelOptions();
    const plugins = this.buildPlugins(authConfig);
    const socialProviders = this.buildSocialProviders(authConfig);
    const passwordCodec = this.bcryptPasswordCodec;
    const options: BetterAuthOptions = {
      secret: this.requireAuthSecret(),
      basePath: "/api/auth",
      baseURL: this.betterAuthBaseUrlPolicy.resolveOriginFromEnv(this.appConfig.env),
      trustedOrigins: [...this.betterAuthBaseUrlPolicy.resolveTrustedOriginsFromEnv(this.appConfig.env)],
      database: adapter,
      advanced: {
        trustedProxyHeaders: true,
      },
      rateLimit: {
        enabled: false,
      },
      emailAndPassword:
        authConfig?.kind === "local"
          ? {
              enabled: true,
              disableSignUp: true,
              password: {
                hash: (plaintext: string) => passwordCodec.hashPlaintext(plaintext),
                verify: (input: { hash: string; password: string }) => passwordCodec.verifyAgainstHash(input),
              },
            }
          : {
              enabled: false,
            },
      databaseHooks: {
        session: {
          create: {
            before: async (session: { userId: string }) => {
              const ok = await sessionEligibility.mayCreateOrResumeBetterAuthSession(session.userId);
              if (!ok) {
                return false;
              }
            },
          },
        },
      },
      socialProviders,
      plugins,
      ...modelSlice,
    };
    return betterAuth(options);
  }

  private buildPlugins(authConfig: CodemationAuthConfig | undefined) {
    const genericConfigs = this.buildGenericOAuthProviderConfigs(authConfig);
    if (genericConfigs.length === 0) {
      return [];
    }
    return [genericOAuth({ config: [...genericConfigs] })];
  }

  private buildSocialProviders(
    authConfig: CodemationAuthConfig | undefined,
  ): NonNullable<BetterAuthOptions["socialProviders"]> {
    const out: NonNullable<BetterAuthOptions["socialProviders"]> = {};
    if (!authConfig?.oauth) {
      return out;
    }
    const env = this.appConfig.env;
    for (const entry of authConfig.oauth) {
      const shared = {
        clientId: env[entry.clientIdEnv] ?? "",
        clientSecret: env[entry.clientSecretEnv] ?? "",
      };
      if (entry.provider === "microsoft") {
        out.microsoft = {
          ...shared,
          tenantId: entry.tenantIdEnv ? (env[entry.tenantIdEnv] ?? "common") : "common",
        };
        continue;
      }
      out[entry.provider] = shared;
    }
    return out;
  }

  private buildGenericOAuthProviderConfigs(authConfig: CodemationAuthConfig | undefined): Array<{
    providerId: string;
    discoveryUrl: string;
    clientId: string;
    clientSecret: string;
    pkce: boolean;
    scopes: string[];
  }> {
    if (!authConfig?.oidc?.length) {
      return [];
    }
    const env = this.appConfig.env;
    const defaultScopes: string[] = ["openid", "email", "profile"];
    return authConfig.oidc.map((entry: CodemationAuthOidcProviderConfig) => ({
      providerId: entry.id,
      discoveryUrl: this.resolveDiscoveryUrl(entry.issuer),
      clientId: env[entry.clientIdEnv] ?? "",
      clientSecret: env[entry.clientSecretEnv] ?? "",
      pkce: true,
      scopes: [...defaultScopes],
    }));
  }

  private resolveDiscoveryUrl(issuer: string): string {
    const trimmed = issuer.replace(/\/$/, "");
    if (trimmed.endsWith("/.well-known/openid-configuration")) {
      return trimmed;
    }
    return `${trimmed}/.well-known/openid-configuration`;
  }

  private requireAuthSecret(): string {
    const secret =
      this.appConfig.env.AUTH_SECRET?.trim() ||
      (this.appConfig.env.NODE_ENV !== "production" ? "codemation-dev-auth-secret-not-for-production" : "");
    if (!secret) {
      throw new Error("AUTH_SECRET is required for Codemation authentication.");
    }
    return secret;
  }

  static listConfiguredOAuthProviderIds(authConfig: CodemationAuthConfig | undefined): ReadonlySet<string> {
    const ids = new Set<string>();
    if (!authConfig) {
      return ids;
    }
    for (const entry of authConfig.oauth ?? []) {
      ids.add(entry.provider);
    }
    for (const entry of authConfig.oidc ?? []) {
      ids.add(entry.id);
    }
    return ids;
  }
}
