import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { AuthSnapshotReader } from "./AuthSnapshotReader";

/**
 * Middleware runs on the Edge runtime: no Prisma, no consumer manifest.
 * Verifies Auth.js JWT session cookies using AUTH_SECRET only.
 */
const authSnapshot = AuthSnapshotReader.readFromEnvironment();
const authSecret =
  authSnapshot?.secret?.trim() ||
  process.env.AUTH_SECRET?.trim() ||
  (process.env.NODE_ENV === "development" ? "codemation-dev-auth-secret-not-for-production" : undefined);

export const { auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  secret: authSecret,
  providers: [
    Credentials({
      id: "edge-jwt-verifier-placeholder",
      name: "Edge verifier",
      credentials: {},
      authorize: async () => null,
    }),
  ],
});
