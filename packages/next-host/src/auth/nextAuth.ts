import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { CodemationAuthPrismaClient } from "../server/CodemationAuthPrismaClient";
import { AuthSnapshotResolver } from "./AuthSnapshotResolver";
import { NextAuthProviderCatalog } from "./NextAuthProviderCatalog";

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const env = process.env;
  const authSnapshot = await AuthSnapshotResolver.resolve();
  const prisma = await CodemationAuthPrismaClient.resolveShared();
  const authConfig = authSnapshot.config;
  const secret = authSnapshot.secret;
  if (!secret || secret.trim().length === 0) {
    throw new Error("AUTH_SECRET is required for Codemation authentication.");
  }
  const providers = await NextAuthProviderCatalog.build(authConfig, prisma, env);
  if (env.NODE_ENV === "production" && providers.length === 0) {
    throw new Error("CodemationConfig.auth must configure at least one NextAuth provider for production.");
  }
  return {
    adapter: PrismaAdapter(prisma),
    secret,
    session: { strategy: "jwt" },
    providers: [...providers],
    pages: {
      signIn: "/login",
    },
    trustHost: true,
  };
});
