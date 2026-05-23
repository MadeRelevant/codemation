import { randomUUID } from "node:crypto";

import type { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";

export type NextHostEdgeSeed = Readonly<{
  authSecret: string;
  uiAuthEnabled: boolean;
}>;

/**
 * Resolves the seed values the dev Next.js process needs BEFORE it spawns: the auth secret and
 * whether to skip auth in development. Both are read from env — we deliberately do NOT load
 * `codemation.config.ts` here. Reading a single boolean from the consumer config used to cost
 * ~9s of tsx import + workflow discovery on cold boot; the env-only path keeps this phase
 * under a millisecond.
 *
 * Env vars consumed:
 *   - `AUTH_SECRET` — auth secret (falls back to a development sentinel when absent)
 *   - `CODEMATION_DEV_ALLOW_UNAUTHENTICATED` — `true` skips UI auth (mirrors the previous
 *     `auth.allowUnauthenticatedInDevelopment` config option)
 */
export class NextHostEdgeSeedLoader {
  static readonly defaultDevelopmentAuthSecret = "codemation-dev-auth-secret-not-for-production";

  constructor(private readonly consumerEnvLoader: ConsumerEnvLoader) {}

  resolveDevelopmentServerToken(rawToken: string | undefined): string {
    if (rawToken && rawToken.trim().length > 0) {
      return rawToken;
    }
    return randomUUID();
  }

  async loadForConsumer(
    consumerRoot: string,
    _options?: Readonly<{ configPathOverride?: string }>,
  ): Promise<NextHostEdgeSeed> {
    const env = this.consumerEnvLoader.mergeConsumerRootIntoProcessEnvironment(consumerRoot, process.env);
    return {
      authSecret: this.resolveDevelopmentAuthSecret(env),
      uiAuthEnabled: env.CODEMATION_DEV_ALLOW_UNAUTHENTICATED?.trim().toLowerCase() !== "true",
    };
  }

  resolveDevelopmentAuthSecret(env: NodeJS.ProcessEnv): string {
    const configuredSecret = env.AUTH_SECRET;
    if (configuredSecret && configuredSecret.trim().length > 0) {
      return configuredSecret;
    }
    return NextHostEdgeSeedLoader.defaultDevelopmentAuthSecret;
  }
}
