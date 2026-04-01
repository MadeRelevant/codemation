import { randomUUID } from "node:crypto";

import { CodemationConsumerConfigLoader } from "@codemation/host/server";

import type { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";

export type NextHostEdgeSeed = Readonly<{
  authSecret: string;
  uiAuthEnabled: boolean;
}>;

export class NextHostEdgeSeedLoader {
  static readonly defaultDevelopmentAuthSecret = "codemation-dev-auth-secret-not-for-production";

  constructor(
    private readonly configLoader: CodemationConsumerConfigLoader,
    private readonly consumerEnvLoader: ConsumerEnvLoader,
  ) {}

  resolveDevelopmentServerToken(rawToken: string | undefined): string {
    if (rawToken && rawToken.trim().length > 0) {
      return rawToken;
    }
    return randomUUID();
  }

  async loadForConsumer(
    consumerRoot: string,
    options?: Readonly<{ configPathOverride?: string }>,
  ): Promise<NextHostEdgeSeed> {
    const resolution = await this.configLoader.load({
      consumerRoot,
      configPathOverride: options?.configPathOverride,
    });
    const envForAuthSecret = this.consumerEnvLoader.mergeConsumerRootIntoProcessEnvironment(consumerRoot, process.env);
    return {
      authSecret: this.resolveDevelopmentAuthSecret(envForAuthSecret),
      uiAuthEnabled: resolution.config.auth?.allowUnauthenticatedInDevelopment !== true,
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
