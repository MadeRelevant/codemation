import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Middleware runs on the Edge runtime: no Prisma, no consumer manifest.
 * Verifies Auth.js JWT session cookies using AUTH_SECRET only.
 */
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

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
