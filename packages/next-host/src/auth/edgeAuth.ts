import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authJsLogger } from "./AuthJsLogger";
import { EdgeAuthConfigurationReader } from "./EdgeAuthConfigurationReader";

/**
 * Middleware runs on the Edge runtime: no Prisma, no consumer manifest.
 * Verifies Auth.js JWT session cookies using AUTH_SECRET only.
 */
const edgeAuthConfiguration = new EdgeAuthConfigurationReader().readFromEnvironment();

export const { auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  secret: edgeAuthConfiguration.authSecret ?? undefined,
  logger: authJsLogger,
  providers: [
    Credentials({
      id: "edge-jwt-verifier-placeholder",
      name: "Edge verifier",
      credentials: {},
      authorize: async () => null,
    }),
  ],
});
