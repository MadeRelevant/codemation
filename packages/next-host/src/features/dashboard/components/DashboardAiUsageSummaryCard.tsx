"use client";

import type { TelemetryDashboardSummaryDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { Bot, DatabaseZap, Sparkles, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardAiUsageSummaryCard(props: Readonly<{ summary: TelemetryDashboardSummaryDto | undefined }>) {
  return (
    <Card data-testid="dashboard-ai-summary-card" className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>AI usage</CardTitle>
            <CardDescription>Token consumption across prompts, completions, cache hits, and reasoning.</CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <Bot className="size-3.5" />
            Tokens
          </Badge>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total tokens</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight" data-testid="dashboard-metric-total-tokens">
            {props.summary ? props.summary.ai.totalTokens.toLocaleString() : "—"}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3.5" />
              Input
            </div>
            <div className="mt-1 text-xl font-semibold" data-testid="dashboard-metric-input-tokens">
              {props.summary ? props.summary.ai.inputTokens.toLocaleString() : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <WandSparkles className="size-3.5" />
              Output
            </div>
            <div className="mt-1 text-xl font-semibold" data-testid="dashboard-metric-output-tokens">
              {props.summary ? props.summary.ai.outputTokens.toLocaleString() : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <DatabaseZap className="size-3.5" />
              Cached input
            </div>
            <div className="mt-1 text-xl font-semibold">
              {props.summary ? props.summary.ai.cachedInputTokens.toLocaleString() : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Bot className="size-3.5" />
              Reasoning
            </div>
            <div className="mt-1 text-xl font-semibold" data-testid="dashboard-metric-reasoning-tokens">
              {props.summary ? props.summary.ai.reasoningTokens.toLocaleString() : "—"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
