import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  CostTrackingPriceQuote,
  CostTrackingTelemetry,
  CostTrackingUsageRecord,
  NodeExecutionTelemetry,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
} from "../../src/index.ts";
import { CatalogBackedCostTrackingTelemetryFactory } from "../../src/execution/CatalogBackedCostTrackingTelemetryFactory.ts";
import { StaticCostCatalog } from "../../src/execution/StaticCostCatalog.ts";

class RecordingSpanScope implements TelemetrySpanScope {
  readonly metrics: TelemetryMetricRecord[] = [];

  constructor(
    public readonly traceId: string,
    public readonly spanId: string,
  ) {}

  addSpanEvent(_: TelemetrySpanEventRecord): void {}

  recordMetric(args: TelemetryMetricRecord): void {
    this.metrics.push(args);
  }

  attachArtifact(_: TelemetryArtifactAttachment): TelemetryArtifactReference {
    return { artifactId: `${this.spanId}:artifact` };
  }

  end(_: TelemetrySpanEnd = {}): void {}
}

class RecordingExecutionTelemetry extends RecordingSpanScope implements NodeExecutionTelemetry {
  readonly nodeScopes = new Map<string, RecordingSpanScope>();

  forNode(args: Readonly<{ nodeId: string; activationId: string }>): NodeExecutionTelemetry {
    const key = `${args.nodeId}::${args.activationId}`;
    const scope = this.nodeScopes.get(key);
    if (scope) {
      return this;
    }
    this.nodeScopes.set(key, new RecordingSpanScope(this.traceId, key));
    return this;
  }

  startChildSpan(_: TelemetryChildSpanStart): TelemetrySpanScope {
    return new RecordingSpanScope(this.traceId, `child-${this.metrics.length}`);
  }
}

class CostTrackingTelemetryHarness {
  readonly executionTelemetry = new RecordingExecutionTelemetry("trace-1", "span-root");
  readonly costTracking: CostTrackingTelemetry;

  constructor() {
    this.costTracking = new CatalogBackedCostTrackingTelemetryFactory(
      new StaticCostCatalog([
        {
          component: "chat",
          provider: "openai",
          operation: "completion.input",
          pricingKey: "gpt-4.1-nano",
          usageUnit: "input_tokens",
          currency: "USD",
          currencyScale: 1_000_000_000,
          pricePerUnitMinor: 100,
        },
        {
          component: "chat",
          provider: "openai",
          operation: "completion.output",
          pricingKey: "gpt-4.1-nano",
          usageUnit: "output_tokens",
          currency: "USD",
          currencyScale: 1_000_000_000,
          pricePerUnitMinor: 400,
        },
        {
          component: "ocr",
          provider: "azure_document_intelligence",
          operation: "analyze_document",
          pricingKey: "prebuilt_read",
          usageUnit: "pages",
          currency: "EUR",
          currencyScale: 1_000_000_000,
          pricePerUnitMinor: 15_000_000,
        },
        {
          component: "rag",
          provider: "openai",
          operation: "embed_documents",
          pricingKey: "text-embedding-3-small",
          usageUnit: "input_tokens",
          currency: "USD",
          currencyScale: 1_000_000_000,
          pricePerUnitMinor: 20,
        },
      ]),
    ).create({ telemetry: this.executionTelemetry });
  }

  metrics(): ReadonlyArray<TelemetryMetricRecord> {
    return this.executionTelemetry.metrics;
  }
}

test("CatalogBackedCostTrackingTelemetry records usage and estimated cost metrics from catalog entries", async () => {
  const harness = new CostTrackingTelemetryHarness();

  const quote = await harness.costTracking.captureUsage({
    component: "chat",
    provider: "openai",
    operation: "completion.input",
    pricingKey: "gpt-4.1-nano",
    usageUnit: "input_tokens",
    quantity: 11,
  });

  assert.deepEqual(quote, {
    currency: "USD",
    currencyScale: 1_000_000_000,
    estimatedAmountMinor: 1_100,
    estimateKind: "catalog",
  } satisfies CostTrackingPriceQuote);
  assert.deepEqual(
    harness.metrics().map((metric) => [metric.name, metric.value, metric.unit]),
    [
      ["codemation.cost.usage", 11, "input_tokens"],
      ["codemation.cost.estimated", 1_100, "USD"],
    ],
  );
});

test("CatalogBackedCostTrackingTelemetry prices chat, OCR, and RAG units and skips unknown pricing keys", async () => {
  const harness = new CostTrackingTelemetryHarness();

  const quotes = await Promise.all([
    harness.costTracking.captureUsage({
      component: "chat",
      provider: "openai",
      operation: "completion.output",
      pricingKey: "gpt-4.1-nano",
      usageUnit: "output_tokens",
      quantity: 7,
    }),
    harness.costTracking.captureUsage({
      component: "ocr",
      provider: "azure_document_intelligence",
      operation: "analyze_document",
      pricingKey: "prebuilt_read",
      usageUnit: "pages",
      quantity: 3,
    }),
    harness.costTracking.captureUsage({
      component: "rag",
      provider: "openai",
      operation: "embed_documents",
      pricingKey: "text-embedding-3-small",
      usageUnit: "input_tokens",
      quantity: 500,
    }),
    harness.costTracking.captureUsage({
      component: "chat",
      provider: "openai",
      operation: "completion.input",
      pricingKey: "missing-model",
      usageUnit: "input_tokens",
      quantity: 1,
    }),
  ]);

  assert.deepEqual(quotes, [
    {
      currency: "USD",
      currencyScale: 1_000_000_000,
      estimatedAmountMinor: 2_800,
      estimateKind: "catalog",
    },
    {
      currency: "EUR",
      currencyScale: 1_000_000_000,
      estimatedAmountMinor: 45_000_000,
      estimateKind: "catalog",
    },
    {
      currency: "USD",
      currencyScale: 1_000_000_000,
      estimatedAmountMinor: 10_000,
      estimateKind: "catalog",
    },
    undefined,
  ]);

  const costMetrics = harness
    .metrics()
    .filter((metric) => metric.name === "codemation.cost.estimated")
    .map((metric) => [metric.value, metric.unit]);
  assert.deepEqual(costMetrics, [
    [2_800, "USD"],
    [45_000_000, "EUR"],
    [10_000, "USD"],
  ]);
});

test("CatalogBackedCostTrackingTelemetry always records usage metrics even when pricing is unknown", async () => {
  const harness = new CostTrackingTelemetryHarness();

  const quote = await harness.costTracking.captureUsage({
    component: "chat",
    provider: "openai",
    operation: "completion.input",
    pricingKey: "missing-model",
    usageUnit: "input_tokens",
    quantity: 99,
  } satisfies CostTrackingUsageRecord);

  assert.equal(quote, undefined);
  assert.deepEqual(harness.metrics(), [
    {
      name: "codemation.cost.usage",
      value: 99,
      unit: "input_tokens",
      attributes: {
        "cost.component": "chat",
        "cost.provider": "openai",
        "cost.operation": "completion.input",
        "cost.pricing_key": "missing-model",
        "cost.usage_unit": "input_tokens",
      },
    },
  ]);
});
