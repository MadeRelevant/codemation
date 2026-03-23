import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { CodemationAuthPrismaClient } from "../server/CodemationAuthPrismaClient";
import { CodemationNextAuthConfigResolver } from "./CodemationNextAuthConfigResolver";
import { CodemationNextAuthProviderCatalog } from "./CodemationNextAuthProviderCatalog";

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const env = process.env;
  const authConfig = await new CodemationNextAuthConfigResolver().resolve();
  const secretFromEnv = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  const secret =
    secretFromEnv?.trim() ||
    (env.NODE_ENV === "development"
      ? "codemation-dev-auth-secret-not-for-production"
      : undefined);
  if (!secret || secret.trim().length === 0) {
    throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) is required for Codemation authentication.");
  }
  const providers = await CodemationNextAuthProviderCatalog.build(
    authConfig,
    CodemationAuthPrismaClient.shared,
    env,
  );
  if (env.NODE_ENV === "production" && providers.length === 0) {
    throw new Error("CodemationConfig.auth must configure at least one NextAuth provider for production.");
  }
  return {
    adapter: PrismaAdapter(CodemationAuthPrismaClient.shared),
    secret,
    session: { strategy: "jwt" },
    providers: [...providers],
    pages: {
      signIn: "/login",
    },
    trustHost: true,
  };
});
