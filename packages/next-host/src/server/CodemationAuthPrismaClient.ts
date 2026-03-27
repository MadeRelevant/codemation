import type { PrismaClient } from "@codemation/host-src/infrastructure/persistence/generated/prisma-client/client.js";

export class CodemationAuthPrismaClient {
  static async resolveShared(): Promise<PrismaClient> {
    return await CodemationAuthPrismaClient.resolveFromPreparedNextHost();
  }

  private static async resolveFromPreparedNextHost(): Promise<PrismaClient> {
    const { CodemationNextHost } = await import("./CodemationNextHost");
    try {
      return await CodemationNextHost.shared.getPreparedPrismaClient();
    } catch {
      throw new Error(
        [
          "Codemation authentication requires prepared runtime database persistence.",
          "Ensure the Next host has been prepared with PostgreSQL or PGlite before creating the auth adapter.",
        ].join(" "),
      );
    }
  }
}
