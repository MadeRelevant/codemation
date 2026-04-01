export type EdgeAuthConfiguration = Readonly<{
  authSecret: string | null;
  uiAuthEnabled: boolean;
}>;

export class EdgeAuthConfigurationReader {
  readFromEnvironment(env: NodeJS.ProcessEnv = process.env): EdgeAuthConfiguration {
    return {
      authSecret: this.resolveAuthSecret(env),
      uiAuthEnabled: env.CODEMATION_UI_AUTH_ENABLED !== "false",
    };
  }

  private resolveAuthSecret(env: NodeJS.ProcessEnv): string | null {
    const resolvedSecret =
      env.AUTH_SECRET?.trim() ||
      (env.NODE_ENV === "development" ? "codemation-dev-auth-secret-not-for-production" : undefined);
    return resolvedSecret && resolvedSecret.length > 0 ? resolvedSecret : null;
  }
}
