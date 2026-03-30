import { randomUUID } from "node:crypto";

import { CodemationConsumerConfigLoader } from "@codemation/host/server";

import type { ConsumerEnvLoader } from "../consumer/ConsumerEnvLoader";

export type DevResolvedAuthSettings = Readonly<{
  authConfigJson: string;
  authSecret: string;
  skipUiAuth: boolean;
}>;

export class DevAuthSettingsLoader {
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

  async loadForConsumer(consumerRoot: string): Promise<DevResolvedAuthSettings> {
    const resolution = await this.configLoader.load({ consumerRoot });
    const envForAuthSecret = this.consumerEnvLoader.mergeConsumerRootIntoProcessEnvironment(consumerRoot, process.env);
    return {
      authConfigJson: JSON.stringify(resolution.config.auth ?? null),
      authSecret: this.resolveDevelopmentAuthSecret(envForAuthSecret),
      skipUiAuth: resolution.config.auth?.allowUnauthenticatedInDevelopment === true,
    };
  }

  resolveDevelopmentAuthSecret(env: NodeJS.ProcessEnv): string {
    const configuredSecret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
    if (configuredSecret && configuredSecret.trim().length > 0) {
      return configuredSecret;
    }
    return DevAuthSettingsLoader.defaultDevelopmentAuthSecret;
  }
}
