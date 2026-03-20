import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { CodemationAuthPrismaClient } from "../server/CodemationAuthPrismaClient";
import { CodemationNextAuthProviderCatalog } from "./CodemationNextAuthProviderCatalog";

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const { CodemationNextHost } = await import("../server/CodemationNextHost");
  const context = await CodemationNextHost.shared.prepare();
  const env = process.env;
  const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) is required for Codemation authentication.");
  }
  const providers = await CodemationNextAuthProviderCatalog.build(
    context.authConfig,
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
