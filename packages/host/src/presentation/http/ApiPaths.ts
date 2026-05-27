export class ApiPaths {
  private static readonly apiBasePath = "/api";

  private static readonly workflowsBasePath = `${this.apiBasePath}/workflows`;

  private static readonly runsBasePath = `${this.apiBasePath}/runs`;

  private static readonly credentialsBasePath = `${this.apiBasePath}/credentials`;

  private static readonly oauth2BasePath = `${this.apiBasePath}/oauth2`;

  private static readonly webhooksBasePath = `${this.apiBasePath}/webhooks`;

  private static readonly usersBasePath = `${this.apiBasePath}/users`;

  private static readonly telemetryBasePath = `${this.apiBasePath}/telemetry`;

  private static readonly whitelabelBasePath = `${this.apiBasePath}/whitelabel`;

  private static readonly bootstrapBasePath = `${this.apiBasePath}/bootstrap`;

  private static readonly authBasePath = `${this.apiBasePath}/auth`;

  private static readonly collectionsBasePath = `${this.apiBasePath}/collections`;

  static collections(): string {
    return this.collectionsBasePath;
  }

  static collection(name: string): string {
    return `${this.collectionsBasePath}/${encodeURIComponent(name)}`;
  }

  static collectionRows(name: string): string {
    return `${this.collection(name)}/rows`;
  }

  static collectionRow(name: string, id: string): string {
    return `${this.collectionRows(name)}/${encodeURIComponent(id)}`;
  }

  static syncCollections(): string {
    return `${this.collectionsBasePath}/sync`;
  }

  static workflows(): string {
    return this.workflowsBasePath;
  }

  static workflow(workflowId: string): string {
    return `${this.workflowsBasePath}/${encodeURIComponent(workflowId)}`;
  }

  static workflowActivation(workflowId: string): string {
    return `${this.workflow(workflowId)}/activation`;
  }

  static workflowRuns(workflowId: string): string {
    return `${this.workflow(workflowId)}/runs`;
  }

  static workflowTestSuiteRuns(workflowId: string): string {
    return `${this.workflow(workflowId)}/test-suite-runs`;
  }

  /**
   * `GET` returns per-assertion-metric trends across the workflow's recent suite runs. With
   * no `names` arg, every distinct assertion name is returned (so the multi-select can populate);
   * with `names`, only the requested subset is returned (order preserved).
   */
  static workflowAssertionMetricTrends(workflowId: string, names?: ReadonlyArray<string>): string {
    const base = `${this.workflow(workflowId)}/assertion-metric-trends`;
    if (!names || names.length === 0) {
      return base;
    }
    return `${base}?names=${names.map((n) => encodeURIComponent(n)).join(",")}`;
  }

  static testSuiteRun(testSuiteRunId: string): string {
    return `${this.apiBasePath}/test-suite-runs/${encodeURIComponent(testSuiteRunId)}`;
  }

  static testSuiteRunAssertions(testSuiteRunId: string): string {
    return `${this.testSuiteRun(testSuiteRunId)}/assertions`;
  }

  static testSuiteRunChildRuns(testSuiteRunId: string): string {
    return `${this.testSuiteRun(testSuiteRunId)}/runs`;
  }

  static runAssertions(runId: string): string {
    return `${this.runState(runId)}/assertions`;
  }

  static workflowCredentialHealth(workflowId: string): string {
    return `${this.workflow(workflowId)}/credential-health`;
  }

  static workflowDebuggerOverlay(workflowId: string): string {
    return `${this.workflow(workflowId)}/debugger-overlay`;
  }

  static workflowDebuggerOverlayCopyRun(workflowId: string): string {
    return `${this.workflowDebuggerOverlay(workflowId)}/copy-run`;
  }

  static workflowDebuggerOverlayBinaryUpload(workflowId: string): string {
    return `${this.workflowDebuggerOverlay(workflowId)}/binary/upload`;
  }

  static workflowOverlayBinaryContent(workflowId: string, binaryId: string): string {
    return `${this.workflow(workflowId)}/debugger-overlay/binary/${encodeURIComponent(binaryId)}/content`;
  }

  static runs(): string {
    return this.runsBasePath;
  }

  static run(): string {
    return this.runs();
  }

  static credentialTypes(): string {
    return `${this.credentialsBasePath}/types`;
  }

  static credentialsEnvStatus(): string {
    return `${this.credentialsBasePath}/env-status`;
  }

  static credentialInstances(): string {
    return `${this.credentialsBasePath}/instances`;
  }

  static credentialInstance(instanceId: string, withSecrets?: boolean): string {
    const base = `${this.credentialInstances()}/${encodeURIComponent(instanceId)}`;
    return withSecrets ? `${base}?withSecrets=1` : base;
  }

  static credentialInstanceTest(instanceId: string): string {
    return `${this.credentialInstance(instanceId)}/test`;
  }

  static credentialBindings(): string {
    return `${this.apiBasePath}/credential-bindings`;
  }

  static oauth2RedirectUri(): string {
    return `${this.oauth2BasePath}/redirect-uri`;
  }

  static oauth2Disconnect(instanceId: string): string {
    return `${this.oauth2BasePath}/disconnect?instanceId=${encodeURIComponent(instanceId)}`;
  }

  static credentialOAuthStart(): string {
    return `${this.credentialsBasePath}/oauth/start`;
  }

  static workflowWebsocket(): string {
    return `${this.workflowsBasePath}/ws`;
  }

  /** Dev gateway: stable browser WebSocket for build lifecycle (CLI → gateway → browser). */
  static devGatewaySocket(): string {
    return `${this.apiBasePath}/dev/socket`;
  }

  /** Dev gateway: HTTP notify endpoint used by the Codemation CLI during consumer rebuilds. */
  static devGatewayNotify(): string {
    return `${this.apiBasePath}/dev/notify`;
  }

  static webhooks(): string {
    return this.webhooksBasePath;
  }

  static users(): string {
    return this.usersBasePath;
  }

  static telemetryDashboardSummary(): string {
    return `${this.telemetryBasePath}/dashboard/summary`;
  }

  static telemetryDashboardTimeseries(): string {
    return `${this.telemetryBasePath}/dashboard/timeseries`;
  }

  static telemetryDashboardDimensions(): string {
    return `${this.telemetryBasePath}/dashboard/dimensions`;
  }

  static telemetryDashboardRuns(): string {
    return `${this.telemetryBasePath}/dashboard/runs`;
  }

  static telemetryRunTrace(runId: string): string {
    return `${this.telemetryBasePath}/runs/${runId}/trace`;
  }

  static authSession(): string {
    return `${this.authBasePath}/session`;
  }

  static authLogin(): string {
    return `${this.authBasePath}/login`;
  }

  static authLogout(): string {
    return `${this.authBasePath}/logout`;
  }

  static authOAuthStart(providerId: string, callbackUrl?: string): string {
    const base = `${this.authBasePath}/oauth/${encodeURIComponent(providerId)}/start`;
    if (!callbackUrl) {
      return base;
    }
    return `${base}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  static authOAuthCallback(providerId: string): string {
    return `${this.authBasePath}/oauth/${encodeURIComponent(providerId)}/callback`;
  }

  static userInviteVerify(): string {
    return `${this.usersBasePath}/invites/verify`;
  }

  static userInviteAccept(): string {
    return `${this.usersBasePath}/invites/accept`;
  }

  static userInvites(): string {
    return `${this.usersBasePath}/invites`;
  }

  static userInviteRegenerate(userId: string): string {
    return `${this.usersBasePath}/${encodeURIComponent(userId)}/invites/regenerate`;
  }

  static userStatus(userId: string): string {
    return `${this.usersBasePath}/${encodeURIComponent(userId)}/status`;
  }

  static runState(runId: string): string {
    return `${this.runsBasePath}/${encodeURIComponent(runId)}`;
  }

  static runDetail(runId: string): string {
    return `${this.runState(runId)}/detail`;
  }

  static runWorkflowSnapshot(runId: string): string {
    return `${this.runState(runId)}/workflow-snapshot`;
  }

  static runNodePin(runId: string, nodeId: string): string {
    return `${this.runState(runId)}/nodes/${encodeURIComponent(nodeId)}/pin`;
  }

  static runNode(runId: string, nodeId: string): string {
    return `${this.runState(runId)}/nodes/${encodeURIComponent(nodeId)}/run`;
  }

  static runBinaryContent(runId: string, binaryId: string): string {
    return `${this.runState(runId)}/binary/${encodeURIComponent(binaryId)}/content`;
  }

  /** Anonymous: consumer logo from `codemation.config.ts` whitelabel.logoPath. */
  static whitelabelLogo(): string {
    return `${this.whitelabelBasePath}/logo`;
  }

  static frontendBootstrap(): string {
    return `${this.bootstrapBasePath}/frontend`;
  }

  static internalAuthBootstrap(): string {
    return `${this.bootstrapBasePath}/auth/internal`;
  }

  /** Token-authenticated: resume a suspended HITL task. */
  static hitlTaskResume(taskId: string): string {
    return `${this.apiBasePath}/hitl/tasks/${encodeURIComponent(taskId)}/resume`;
  }

  /** Session-authenticated: record a decision on a suspended HITL task. */
  static hitlTaskDecide(taskId: string): string {
    return `${this.apiBasePath}/hitl/tasks/${encodeURIComponent(taskId)}/decide`;
  }
}
