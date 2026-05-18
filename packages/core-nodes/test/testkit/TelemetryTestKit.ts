import type {
  CostTrackingPriceQuote,
  CostTrackingTelemetry,
  CostTrackingUsageRecord,
  CredentialSessionService,
  NodeExecutionTelemetry,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
} from "@codemation/core";

/**
 * TelemetrySpanScope that records all calls so tests can assert on telemetry output.
 * Extended by CapturingNodeTelemetry for the full NodeExecutionTelemetry contract.
 */
export class CapturingTelemetrySpanScope implements TelemetrySpanScope {
  readonly metrics: TelemetryMetricRecord[] = [];
  readonly events: TelemetrySpanEventRecord[] = [];
  readonly artifacts: TelemetryArtifactAttachment[] = [];
  readonly ended: TelemetrySpanEnd[] = [];
  costTracking?: CostTrackingTelemetry;
  protected readonly children: CapturingTelemetrySpanScope[];

  constructor(
    public readonly traceId: string,
    public readonly spanId: string,
    childSpans: CapturingTelemetrySpanScope[],
    public readonly initialAttributes?: Record<string, unknown>,
  ) {
    this.children = childSpans;
  }

  addSpanEvent(args: TelemetrySpanEventRecord): void {
    this.events.push(args);
  }

  recordMetric(args: TelemetryMetricRecord): void {
    this.metrics.push(args);
  }

  attachArtifact(args: TelemetryArtifactAttachment): TelemetryArtifactReference {
    this.artifacts.push(args);
    return { artifactId: `${this.spanId}:artifact` };
  }

  end(args: TelemetrySpanEnd = {}): void {
    this.ended.push(args);
  }

  createChild(spanId: string, initialAttributes?: Record<string, unknown>): CapturingTelemetrySpanScope {
    const child = new CapturingTelemetrySpanScope(this.traceId, spanId, this.children, initialAttributes);
    this.children.push(child);
    return child;
  }
}

/**
 * NodeExecutionTelemetry that records all telemetry calls.
 * Inspect `.metrics`, `.events`, `.artifacts`, `.children`, etc. in assertions.
 */
export class CapturingNodeTelemetry extends CapturingTelemetrySpanScope implements NodeExecutionTelemetry {
  constructor(traceId = "trace-1", spanId = "node-span-1") {
    super(traceId, spanId, []);
  }

  forNode(): NodeExecutionTelemetry {
    return this;
  }

  startChildSpan(args?: TelemetryChildSpanStart): TelemetrySpanScope {
    const child = this.createChild(
      `child-${this.metrics.length}-${this.events.length}-${this.artifacts.length}`,
      (args?.attributes as Record<string, unknown> | undefined) ?? undefined,
    );
    child.costTracking = this.costTracking?.forScope(child);
    return child;
  }

  childSpans(): ReadonlyArray<CapturingTelemetrySpanScope> {
    return [...this.children];
  }
}

/**
 * CostTrackingTelemetry that records usage records and delegates metric recording
 * to its parent scope. Usages are accumulated in `capturedUsages`.
 */
export class CapturingCostTrackingTelemetry implements CostTrackingTelemetry {
  constructor(
    private readonly scope: TelemetrySpanScope,
    private readonly capturedUsages: CostTrackingUsageRecord[],
  ) {}

  async captureUsage(args: CostTrackingUsageRecord): Promise<CostTrackingPriceQuote | undefined> {
    this.capturedUsages.push(args);
    const estimatedAmountMinor = args.operation === "completion.output" ? args.quantity * 2_000 : args.quantity * 1_000;
    await this.scope.recordMetric({
      name: "codemation.cost.estimated",
      value: estimatedAmountMinor,
      unit: "USD",
      attributes: {
        "cost.component": args.component,
        "cost.currency": "USD",
        "cost.currency_scale": 1_000_000_000,
      },
    });
    return {
      currency: "USD",
      currencyScale: 1_000_000_000,
      estimatedAmountMinor,
      estimateKind: "catalog",
    };
  }

  forScope(scope: TelemetrySpanScope): CostTrackingTelemetry {
    return new CapturingCostTrackingTelemetry(scope, this.capturedUsages);
  }
}

/**
 * Minimal CredentialSessionService stub — always resolves with an empty string session.
 */
export class StubCredentialSessionService implements CredentialSessionService {
  async getSession(): Promise<unknown> {
    return "";
  }
}
