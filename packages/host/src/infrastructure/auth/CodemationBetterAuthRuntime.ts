import { betterAuth } from "better-auth";

import type { AppConfig } from "../../presentation/config/AppConfig";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { CodemationBetterAuthServerFactory } from "./CodemationBetterAuthServerFactory";

/**
 * Lazily constructs and caches the Better Auth instance when Prisma is available.
 */
export class CodemationBetterAuthRuntime {
  private cached: ReturnType<typeof betterAuth> | undefined;

  constructor(
    private readonly appConfig: AppConfig,
    private readonly serverFactory: CodemationBetterAuthServerFactory,
    private readonly prisma: PrismaDatabaseClient | undefined,
  ) {}

  tryGetAuth(): ReturnType<typeof betterAuth> | undefined {
    if (!this.prisma) {
      return undefined;
    }
    if (!this.cached) {
      this.cached = this.serverFactory.create(this.prisma);
    }
    return this.cached;
  }

  getAuthOrThrow(): ReturnType<typeof betterAuth> {
    const auth = this.tryGetAuth();
    if (!auth) {
      throw new ApplicationRequestError(503, "Authentication requires prepared runtime database persistence.");
    }
    return auth;
  }
}
