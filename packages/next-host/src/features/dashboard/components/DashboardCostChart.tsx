"use client";

import type {
  TelemetryDashboardBucketCostDto,
  TelemetryDashboardTimeseriesDto,
} from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardCostAmountFormatter } from "../lib/DashboardCostAmountFormatter";
import { DashboardDateTimeFormatter } from "../lib/DashboardDateTimeFormatter";
import { DashboardChartCard } from "./DashboardChartCard";

type CostCurrencyOption = Readonly<{
  key: string;
  currency: string;
  currencyScale: number;
}>;

type CostBreakdownSeries = Readonly<{
  key: string;
  label: string;
}>;

export function DashboardCostChart(props: Readonly<{ series: TelemetryDashboardTimeseriesDto }>) {
  const [mode, setMode] = useState<"total" | "breakdown">("total");
  const currencies = useMemo<ReadonlyArray<CostCurrencyOption>>(() => {
    const options = new Map<string, CostCurrencyOption>();
    for (const bucket of props.series.buckets) {
      for (const cost of bucket.costs) {
        const key = `${cost.currency}:${String(cost.currencyScale)}`;
        if (options.has(key)) {
          continue;
        }
        options.set(key, {
          key,
          currency: cost.currency,
          currencyScale: cost.currencyScale,
        });
      }
    }
    return [...options.values()];
  }, [props.series.buckets]);
  const [selectedCurrencyKey, setSelectedCurrencyKey] = useState<string>(currencies[0]?.key ?? "");

  useEffect(() => {
    if (!currencies.some((currency) => currency.key === selectedCurrencyKey)) {
      setSelectedCurrencyKey(currencies[0]?.key ?? "");
    }
  }, [currencies, selectedCurrencyKey]);

  const selectedCurrency = currencies.find((currency) => currency.key === selectedCurrencyKey) ?? currencies[0];
  const breakdownSeries = useMemo<ReadonlyArray<CostBreakdownSeries>>(() => {
    if (!selectedCurrency) {
      return [];
    }
    const series = new Map<string, CostBreakdownSeries>();
    for (const bucket of props.series.buckets) {
      for (const cost of bucket.costs) {
        if (cost.currency !== selectedCurrency.currency || cost.currencyScale !== selectedCurrency.currencyScale) {
          continue;
        }
        const key = `${cost.component ?? ""}::${cost.costKey ?? ""}`;
        if (series.has(key)) {
          continue;
        }
        series.set(key, {
          key,
          label: thisClass.buildSeriesLabel(cost),
        });
      }
    }
    return [...series.values()];
  }, [props.series.buckets, selectedCurrency]);
  const data = useMemo(() => {
    if (!selectedCurrency) {
      return [];
    }
    return props.series.buckets.map((bucket) => {
      const matchingCosts = bucket.costs.filter(
        (cost) => cost.currency === selectedCurrency.currency && cost.currencyScale === selectedCurrency.currencyScale,
      );
      const row: Record<string, number | string> = {
        label: DashboardDateTimeFormatter.formatBucketLabel(props.series.interval, bucket.bucketStartIso),
        estimatedCost: DashboardCostAmountFormatter.normalizeAmount({
          amountMinor: matchingCosts.reduce((sum, cost) => sum + cost.estimatedCostMinor, 0),
          currencyScale: selectedCurrency.currencyScale,
        }),
      };
      for (const series of breakdownSeries) {
        const seriesCost = matchingCosts
          .filter((cost) => `${cost.component ?? ""}::${cost.costKey ?? ""}` === series.key)
          .reduce((sum, cost) => sum + cost.estimatedCostMinor, 0);
        row[series.key] = DashboardCostAmountFormatter.normalizeAmount({
          amountMinor: seriesCost,
          currencyScale: selectedCurrency.currencyScale,
        });
      }
      return row;
    });
  }, [breakdownSeries, props.series.buckets, props.series.interval, selectedCurrency]);
  const chartColors = [
    "var(--color-chart-1, #2563eb)",
    "var(--color-chart-2, #7c3aed)",
    "var(--color-chart-3, #0f766e)",
    "var(--color-chart-4, #d97706)",
    "var(--color-chart-5, #dc2626)",
  ];

  return (
    <DashboardChartCard
      title="Cost over time"
      description="Estimated execution cost over time for the selected workflows."
      testId="dashboard-cost-chart-card"
    >
      {currencies.length > 1 || breakdownSeries.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          {breakdownSeries.length > 0 ? (
            <Tabs value={mode} onValueChange={(value) => setMode(value as "total" | "breakdown")}>
              <TabsList>
                <TabsTrigger value="total" data-testid="dashboard-cost-chart-total">
                  Total
                </TabsTrigger>
                <TabsTrigger value="breakdown" data-testid="dashboard-cost-chart-breakdown">
                  Breakdown
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <div />
          )}
          <Tabs value={selectedCurrencyKey} onValueChange={setSelectedCurrencyKey}>
            <TabsList>
              {currencies.map((currency) => (
                <TabsTrigger
                  key={currency.key}
                  value={currency.key}
                  data-testid={`dashboard-cost-chart-currency-${currency.currency}`}
                >
                  {currency.currency}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ) : null}
      {selectedCurrency ? (
        <div className="min-h-[280px] min-w-0 h-[280px] w-full" data-testid="dashboard-cost-chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
            <AreaChart data={data}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  thisClass.formatAmountLabel(value, selectedCurrency.currency, selectedCurrency.currencyScale)
                }
              />
              <Tooltip
                formatter={(value, name) => [
                  thisClass.formatAmountLabel(value, selectedCurrency.currency, selectedCurrency.currencyScale),
                  String(name),
                ]}
              />
              {mode === "breakdown" && breakdownSeries.length > 0 ? (
                breakdownSeries.map((series, index) => (
                  <Area
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stackId="costs"
                    stroke={chartColors[index % chartColors.length]}
                    fill={chartColors[index % chartColors.length]}
                    fillOpacity={0.18}
                  />
                ))
              ) : (
                <Area
                  type="monotone"
                  dataKey="estimatedCost"
                  name={`Total ${selectedCurrency.currency}`}
                  stroke="var(--color-chart-2, #7c3aed)"
                  fill="var(--color-chart-2, #7c3aed)"
                  fillOpacity={0.18}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground"
          data-testid="dashboard-cost-chart-empty-state"
        >
          No cost telemetry captured for the selected filters yet.
        </div>
      )}
    </DashboardChartCard>
  );
}

class thisClass {
  static formatAmountLabel(value: unknown, currency: string, currencyScale: number): string {
    const normalizedAmount = typeof value === "number" ? value : Number(value ?? 0);
    return DashboardCostAmountFormatter.format({
      currency,
      amountMinor: normalizedAmount * currencyScale,
      currencyScale,
    });
  }

  static buildSeriesLabel(cost: TelemetryDashboardBucketCostDto): string {
    if (cost.component && cost.costKey && cost.component !== cost.costKey) {
      return `${cost.component} · ${cost.costKey}`;
    }
    return cost.costKey ?? cost.component ?? "Other";
  }
}
