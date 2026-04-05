export class ScaffoldedBrowserRuntimeEnvironment {
  createPublishedInstallEnvironment(processEnv: NodeJS.ProcessEnv): Readonly<Record<string, string>> {
    return {
      ...this.stringOnlyProcessEnvironment(processEnv),
      CI: "",
      GITHUB_ACTIONS: "",
      PNPM_CONFIG_FROZEN_LOCKFILE: "false",
      npm_config_frozen_lockfile: "false",
      DATABASE_URL: "",
      REDIS_URL: "",
      CODEMATION_DATABASE_KIND: "sqlite",
      CODEMATION_SCHEDULER: "local",
      CODEMATION_EVENT_BUS: "memory",
    };
  }

  createDevServerEnvironment(processEnv: NodeJS.ProcessEnv, port: number): Readonly<Record<string, string>> {
    return {
      ...this.createPublishedInstallEnvironment(processEnv),
      PORT: String(port),
      AUTH_URL: `http://127.0.0.1:${port}`,
      NEXTAUTH_URL: `http://127.0.0.1:${port}`,
      CODEMATION_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      AUTH_SECRET: "codemation-scaffolded-browser-e2e-auth-secret",
      CODEMATION_CREDENTIALS_MASTER_KEY: "codemation-scaffolded-browser-e2e-master-key",
      CODEMATION_LOG_LEVEL: "info",
      CHOKIDAR_USEPOLLING: "1",
    };
  }

  private stringOnlyProcessEnvironment(processEnv: NodeJS.ProcessEnv): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(processEnv)) {
      if (typeof value === "string") {
        result[key] = value;
      }
    }
    return result;
  }
}
