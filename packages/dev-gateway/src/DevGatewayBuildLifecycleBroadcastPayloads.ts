/**
 * Pure payloads for dev-gateway build lifecycle WebSocket broadcasts.
 * Kept separate from {@link CodemationDevGateway} so the contract is unit-tested:
 * `buildCompleted` must fan out to workflow rooms (same as `buildStarted`), or the
 * next-host workflow socket never receives `devBuildCompleted` and the canvas stays stale.
 */
export class DevGatewayBuildLifecycleBroadcastPayloads {
  static resolveBuildVersionFromNotifyPayload(payload: Readonly<{ buildVersion?: unknown }>): string {
    return typeof payload.buildVersion === "string" && payload.buildVersion.trim().length > 0
      ? payload.buildVersion.trim()
      : `${Date.now()}-gateway`;
  }

  static devSocketDevBuildCompleted(buildVersion: string): Readonly<Record<string, unknown>> {
    return { kind: "devBuildCompleted", buildVersion };
  }

  static workflowRoomDevBuildCompleted(workflowId: string, buildVersion: string): Readonly<Record<string, unknown>> {
    return { kind: "devBuildCompleted", workflowId, buildVersion };
  }
}
