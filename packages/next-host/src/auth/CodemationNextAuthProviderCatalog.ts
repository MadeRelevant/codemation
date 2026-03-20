import { compare } from "bcryptjs";
import type { CodemationAuthConfig, CodemationAuthOidcProviderConfig, CodemationAuthOAuthProviderConfig } from "@codemation/frontend";
import type { PrismaClient } from "@codemation/frontend/persistence";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export class CodemationNextAuthProviderCatalog {
  static async build(
    authConfig: CodemationAuthConfig | undefined,
    prisma: PrismaClient,
    env: NodeJS.ProcessEnv,
  ): Promise<NextAuthConfig["providers"]> {
    if (!authConfig) {
      return [];
    }
    const providers: NextAuthConfig["providers"] = [];
    if (CodemationNextAuthProviderCatalog.includesCredentialsProvider(authConfig)) {
      providers.push(CodemationNextAuthProviderCatalog.createCredentialsProvider(prisma));
    }
    for (const entry of authConfig.oauth ?? []) {
      providers.push(CodemationNextAuthProviderCatalog.createOAuthProvider(entry, env));
    }
    for (const entry of authConfig.oidc ?? []) {
      providers.push(CodemationNextAuthProviderCatalog.createOidcProvider(entry, env));
    }
    return providers;
  }

  private static includesCredentialsProvider(authConfig: CodemationAuthConfig): boolean {
    return authConfig.kind === "local";
  }

  private static createCredentialsProvider(prisma: PrismaClient): NextAuthConfig["providers"][number] {
    return Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) {
          return null;
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.accountStatus === "inactive") {
          return null;
        }
        if (user.accountStatus !== "active") {
          return null;
        }
        const matches = await compare(password, user.passwordHash);
        if (!matches) {
          return null;
        }
        return {
          id: user.id,
          email: user.email ?? email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    });
  }

  private static createOAuthProvider(entry: CodemationAuthOAuthProviderConfig, env: NodeJS.ProcessEnv): NextAuthConfig["providers"][number] {
    const clientId = env[entry.clientIdEnv] ?? "";
    const clientSecret = env[entry.clientSecretEnv] ?? "";
    if (entry.provider === "google") {
      return Google({ clientId, clientSecret });
    }
    if (entry.provider === "github") {
      return GitHub({ clientId, clientSecret });
    }
    const tenantId = entry.tenantIdEnv ? (env[entry.tenantIdEnv] ?? "common") : "common";
    return MicrosoftEntraID({
      clientId,
      clientSecret,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    });
  }

  private static createOidcProvider(entry: CodemationAuthOidcProviderConfig, env: NodeJS.ProcessEnv): NextAuthConfig["providers"][number] {
    return {
      id: entry.id,
      name: entry.id,
      type: "oidc",
      issuer: entry.issuer,
      clientId: env[entry.clientIdEnv] ?? "",
      clientSecret: env[entry.clientSecretEnv] ?? "",
    };
  }
}
