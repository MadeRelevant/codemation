import { CostTrackingTelemetryAttributeNames, CostTrackingTelemetryMetricNames } from "@codemation/core";
import { describe, expect, it } from "vitest";
import { GetIterationCostQuery } from "../../src/application/queries/GetIterationCostQuery";
import { GetIterationCostQueryHandler } from "../../src/application/queries/GetIterationCostQueryHandler";
import { OtelIdentityFactory } from "../../src/application/telemetry/OtelIdentityFactory";
import { InMemoryTelemetryMetricPointStore } from "../../src/infrastructure/persistence/InMemoryTelemetryMetricPointStore";
import type { TelemetryMetricPointWrite } from "../../src/domain/telemetry/TelemetryContracts";

const RUN_ID = "run_iter_cost";
const WORKFLOW_ID = "wf.iter_cost";

function buildCostMetric(args: {
  iterationId?: string;
  value: number;
  currency?: string;
  currencyScale?: number;
  observedAt?: string;
  metricName?: string;
}): TelemetryMetricPointWrite {
  return {
    name: args.metricName ?? CostTrackingTelemetryMetricNames.estimatedCost,
    value: args.value,
    unit: args.currency,
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    observedAt: args.observedAt ?? "2026-04-30T10:00:00Z",
    iterationId: args.iterationId,
    attributes: {
      ...(args.currency ? { [CostTrackingTelemetryAttributeNames.currency]: args.currency } : {}),
      ...(args.currencyScale !== undefined
        ? { [CostTrackingTelemetryAttributeNames.currencyScale]: args.currencyScale }
        : {}),
    },
  };
}

async function buildHandler(): Promise<{
  handler: GetIterationCostQueryHandler;
  store: InMemoryTelemetryMetricPointStore;
}> {
  const store = new InMemoryTelemetryMetricPointStore(new OtelIdentityFactory());
  const handler = new GetIterationCostQueryHandler(store);
  return { handler, store };
}

describe("GetIterationCostQueryHandler", () => {
  it("groups cost metric points by iterationId and currency", async () => {
    const { handler, store } = await buildHandler();
    await store.save(
      buildCostMetric({ iterationId: "iter_a", value: 12_000, currency: "USD", currencyScale: 1_000_000_000 }),
    );
    await store.save(
      buildCostMetric({ iterationId: "iter_a", value: 3_000, currency: "USD", currencyScale: 1_000_000_000 }),
    );
    await store.save(
      buildCostMetric({ iterationId: "iter_b", value: 5_000, currency: "EUR", currencyScale: 1_000_000_000 }),
    );

    const result = await handler.execute(new GetIterationCostQuery(RUN_ID));

    const iterA = result.find((row) => row.iterationId === "iter_a");
    const iterB = result.find((row) => row.iterationId === "iter_b");
    expect(iterA?.estimatedCostMinorByCurrency["USD"]).toBe(15_000);
    expect(iterA?.estimatedCostCurrencyScaleByCurrency["USD"]).toBe(1_000_000_000);
    expect(iterB?.estimatedCostMinorByCurrency["EUR"]).toBe(5_000);
    expect(iterB?.estimatedCostCurrencyScaleByCurrency["EUR"]).toBe(1_000_000_000);
  });

  it("handles multiple currencies inside a single iteration", async () => {
    const { handler, store } = await buildHandler();
    await store.save(buildCostMetric({ iterationId: "iter_x", value: 1_000, currency: "USD", currencyScale: 100 }));
    await store.save(buildCostMetric({ iterationId: "iter_x", value: 250, currency: "EUR", currencyScale: 100 }));

    const result = await handler.execute(new GetIterationCostQuery(RUN_ID));

    expect(result).toHaveLength(1);
    const rollup = result[0]!;
    expect(rollup.estimatedCostMinorByCurrency["USD"]).toBe(1_000);
    expect(rollup.estimatedCostMinorByCurrency["EUR"]).toBe(250);
  });

  it("ignores metric points without an iterationId", async () => {
    const { handler, store } = await buildHandler();
    await store.save(buildCostMetric({ iterationId: undefined, value: 999, currency: "USD", currencyScale: 100 }));

    const result = await handler.execute(new GetIterationCostQuery(RUN_ID));
    expect(result).toEqual([]);
  });

  it("ignores non-cost metric points", async () => {
    const { handler, store } = await buildHandler();
    await store.save(
      buildCostMetric({
        iterationId: "iter_a",
        value: 42,
        currency: "USD",
        currencyScale: 100,
        metricName: "codemation.ai.turns",
      }),
    );

    const result = await handler.execute(new GetIterationCostQuery(RUN_ID));
    expect(result).toEqual([]);
  });

  it("returns an empty array when no metric points exist for the run", async () => {
    const { handler } = await buildHandler();
    const result = await handler.execute(new GetIterationCostQuery(RUN_ID));
    expect(result).toEqual([]);
  });
});
