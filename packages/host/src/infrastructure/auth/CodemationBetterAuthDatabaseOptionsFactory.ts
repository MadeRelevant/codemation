import { prismaAdapter, type PrismaConfig } from "@better-auth/prisma-adapter";
import type { BetterAuthOptions } from "better-auth";

import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

/**
 * Better Auth `user` / `session` / `account` / `verification` options aligned to Codemation Prisma models.
 */
export class CodemationBetterAuthDatabaseOptionsFactory {
  /**
   * Partial Better Auth options: Prisma model names + `fields` / `additionalFields` only.
   */
  buildDatabaseModelOptions(): Pick<BetterAuthOptions, "user" | "session" | "account" | "verification"> {
    return {
      user: {
        modelName: "user",
        additionalFields: {
          accountStatus: {
            type: "string",
            required: true,
            defaultValue: "active",
            fieldName: "accountStatus",
          },
          passwordHash: {
            type: "string",
            required: false,
            input: false,
            returned: false,
            fieldName: "passwordHash",
          },
        },
      },
      session: {
        modelName: "session",
        fields: {
          token: "sessionToken",
          expiresAt: "expires",
        },
      },
      account: {
        modelName: "account",
        fields: {
          accountId: "providerAccountId",
          providerId: "provider",
          accessToken: "access_token",
          refreshToken: "refresh_token",
          idToken: "id_token",
          scope: "scope",
          accessTokenExpiresAt: "accessTokenExpiresAt",
          refreshTokenExpiresAt: "refreshTokenExpiresAt",
        },
        additionalFields: {
          authJsAccountType: {
            type: "string",
            required: false,
            fieldName: "type",
          },
          authJsTokenType: {
            type: "string",
            required: false,
            fieldName: "token_type",
          },
          authJsSessionState: {
            type: "string",
            required: false,
            fieldName: "session_state",
          },
        },
      },
      verification: {
        modelName: "verificationToken",
        fields: {
          value: "token",
          expiresAt: "expires",
        },
      },
    };
  }

  /**
   * Mirrors `packages/host/prisma.config.ts` / `CODEMATION_PRISMA_PROVIDER` so the adapter targets sqlite vs postgresql correctly.
   */
  resolvePrismaProviderForAdapter(environment: NodeJS.ProcessEnv): PrismaConfig["provider"] {
    const configured = environment.CODEMATION_PRISMA_PROVIDER?.trim();
    if (configured === "sqlite" || configured === "postgresql") {
      return configured;
    }
    return "postgresql";
  }

  buildPrismaAdapterConfig(environment: NodeJS.ProcessEnv): PrismaConfig {
    return {
      provider: this.resolvePrismaProviderForAdapter(environment),
      transaction: false,
    };
  }

  /**
   * Returns the Better Auth DB adapter factory for the given Prisma client.
   */
  createPrismaAdapterFactory(
    prisma: PrismaDatabaseClient,
    environment: NodeJS.ProcessEnv,
  ): ReturnType<typeof prismaAdapter> {
    return prismaAdapter(prisma, this.buildPrismaAdapterConfig(environment));
  }
}
