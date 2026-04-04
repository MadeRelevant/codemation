import Credentials from "@auth/core/providers/credentials";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import MicrosoftEntraID from "@auth/core/providers/microsoft-entra-id";
import { compare } from "bcryptjs";
import type { Provider } from "@auth/core/providers";
import type {
  CodemationAuthConfig,
  CodemationAuthOAuthProviderConfig,
  CodemationAuthOidcProviderConfig,
} from "../../presentation/config/CodemationAuthConfig";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

export class CodemationAuthProviderCatalog {
  build(
    authConfig: CodemationAuthConfig | undefined,
    prisma: PrismaDatabaseClient | undefined,
    env: NodeJS.ProcessEnv,
  ): ReadonlyArray<Provider> {
    if (!authConfig) {
      return [];
    }
    const providers: Provider[] = [];
    if (authConfig.kind === "local") {
      providers.push(this.createCredentialsProvider(prisma));
    }
    for (const entry of authConfig.oauth ?? []) {
      providers.push(this.createOAuthProvider(entry, env));
    }
    for (const entry of authConfig.oidc ?? []) {
      providers.push(this.createOidcProvider(entry, env));
    }
    return providers;
  }

  private createCredentialsProvider(prisma: PrismaDatabaseClient | undefined): Provider {
    const resolvedPrisma = this.requirePrisma(prisma);
    return Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) {
          return null;
        }
        const user = await resolvedPrisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.accountStatus !== "active") {
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

  private createOAuthProvider(entry: CodemationAuthOAuthProviderConfig, env: NodeJS.ProcessEnv): Provider {
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

  private createOidcProvider(entry: CodemationAuthOidcProviderConfig, env: NodeJS.ProcessEnv): Provider {
    return {
      id: entry.id,
      name: entry.id,
      type: "oidc",
      issuer: entry.issuer,
      clientId: env[entry.clientIdEnv] ?? "",
      clientSecret: env[entry.clientSecretEnv] ?? "",
    };
  }

  private requirePrisma(prisma: PrismaDatabaseClient | undefined): PrismaDatabaseClient {
    if (!prisma) {
      throw new Error("Authentication providers require a prepared Prisma client.");
    }
    return prisma;
  }
}
