"use client";

import type { TelemetryDashboardSummaryDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Coins, FileSearch, MessagesSquare, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCostAmountFormatter } from "../lib/DashboardCostAmountFormatter";

export function DashboardCostSummaryCard(props: Readonly<{ summary: TelemetryDashboardSummaryDto | undefined }>) {
  const currencies = props.summary?.costs.currencies ?? [];
  const resolveCostKeyIcon = (costKey: string) => {
    const normalized = costKey.toLowerCase();
    if (
      normalized.includes("gpt") ||
      normalized.includes("claude") ||
      normalized.includes("sonnet") ||
      normalized.includes("haiku") ||
      normalized.includes("opus") ||
      normalized.includes("mistral")
    ) {
      return <MessagesSquare className="size-3.5" />;
    }
    if (normalized.includes("ocr") || normalized.includes("invoice") || normalized.includes("prebuilt")) {
      return <FileSearch className="size-3.5" />;
    }
    return <SearchCheck className="size-3.5" />;
  };
  const resolveCostKeyTotals = (
    currencyTotal: (typeof currencies)[number],
  ): ReadonlyArray<Readonly<{ costKey: string; estimatedCostMinor: number }>> => {
    if (Array.isArray(currencyTotal.costKeys)) {
      return currencyTotal.costKeys;
    }
    const legacyComponents = (
      currencyTotal as { components?: ReadonlyArray<{ component: string; estimatedCostMinor: number }> }
    ).components;
    if (!Array.isArray(legacyComponents)) {
      return [];
    }
    return legacyComponents.map((entry) => ({
      costKey: entry.component,
      estimatedCostMinor: entry.estimatedCostMinor,
    }));
  };
  return (
    <Card data-testid="dashboard-cost-summary-card" className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Execution cost</CardTitle>
            <CardDescription>
              Provider-native estimated costs grouped by currency and concrete cost key.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <Coins className="size-3.5" />
            Cost tracking
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currencies.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground"
            data-testid="dashboard-cost-empty-state"
          >
            No cost telemetry captured for the selected filters yet.
          </div>
        ) : (
          currencies.map((currencyTotal) => (
            <section
              key={`${currencyTotal.currency}-${String(currencyTotal.currencyScale)}`}
              className="rounded-lg border border-border/60 bg-muted/20 p-4"
              data-testid={`dashboard-cost-currency-${currencyTotal.currency}`}
            >
              <div className="grid gap-3 min-[520px]:grid-cols-2">
                <div className="min-w-0 rounded-md border border-border/60 bg-background/80 px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Total {currencyTotal.currency}
                  </div>
                  <div className="mt-1 break-all text-lg font-semibold tracking-tight sm:text-xl">
                    {DashboardCostAmountFormatter.format({
                      currency: currencyTotal.currency,
                      amountMinor: currencyTotal.estimatedCostMinor,
                      currencyScale: currencyTotal.currencyScale,
                    })}
                  </div>
                </div>
                <div className="min-w-0 rounded-md border border-border/60 bg-background/80 px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Average per run
                  </div>
                  <div className="mt-1 break-all text-base font-semibold sm:text-lg">
                    {DashboardCostAmountFormatter.format({
                      currency: currencyTotal.currency,
                      amountMinor: currencyTotal.averageCostPerRunMinor,
                      currencyScale: currencyTotal.currencyScale,
                    })}
                  </div>
                </div>
                <div className="grid gap-3 min-[520px]:col-span-2 min-[720px]:grid-cols-2">
                  {resolveCostKeyTotals(currencyTotal).map((costKeyTotal) => (
                    <div
                      key={`${currencyTotal.currency}-${costKeyTotal.costKey}`}
                      className="min-w-0 rounded-md border border-border/60 bg-background/80 px-3 py-3"
                      data-testid={`dashboard-cost-key-${currencyTotal.currency}-${costKeyTotal.costKey}`}
                    >
                      <div className="flex min-w-0 items-start gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span className="shrink-0 pt-0.5">{resolveCostKeyIcon(costKeyTotal.costKey)}</span>
                        <span className="min-w-0 break-words">{costKeyTotal.costKey}</span>
                      </div>
                      <div className="mt-1 break-all text-base font-semibold sm:text-lg">
                        {DashboardCostAmountFormatter.format({
                          currency: currencyTotal.currency,
                          amountMinor: costKeyTotal.estimatedCostMinor,
                          currencyScale: currencyTotal.currencyScale,
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
