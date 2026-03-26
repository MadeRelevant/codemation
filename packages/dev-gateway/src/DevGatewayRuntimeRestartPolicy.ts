/**
 * Decides whether the dev gateway should kill and respawn the runtime child on
 * `buildCompleted` notifications. Playwright browser e2e runs a long-lived stack with a
 * provisioned PostgreSQL database; restarting the runtime mid-run can race Prisma bootstrap
 * against HMR/build notifications and fail with P1003.
 */
export class DevGatewayRuntimeRestartPolicy {
  constructor(private readonly env: NodeJS.ProcessEnv) {}

  shouldRestartOnBuildCompleted(): boolean {
    return this.env.CODEMATION_PLAYWRIGHT_BROWSER_E2E !== "1";
  }
}
