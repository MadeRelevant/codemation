import { randomUUID } from "node:crypto";

import { CodemationConsumerConfigLoader } from "@codemation/host/server";

export type DevResolvedAuthSettings = Readonly<{
  authConfigJson: string;
  skipUiAuth: boolean;
}>;

export class DevAuthSettingsLoader {
  constructor(private readonly configLoader: CodemationConsumerConfigLoader) {}

  resolveDevelopmentServerToken(rawToken: string | undefined): string {
    if (rawToken && rawToken.trim().length > 0) {
      return rawToken;
    }
    return randomUUID();
  }

  async loadForConsumer(consumerRoot: string): Promise<DevResolvedAuthSettings> {
    const resolution = await this.configLoader.load({ consumerRoot });
    return {
      authConfigJson: JSON.stringify(resolution.config.auth ?? null),
      skipUiAuth: resolution.config.auth?.allowUnauthenticatedInDevelopment === true,
    };
  }
}
