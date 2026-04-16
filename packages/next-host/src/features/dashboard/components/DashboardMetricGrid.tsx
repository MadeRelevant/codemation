"use client";

import type { TelemetryDashboardSummaryDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import { DashboardAiUsageSummaryCard } from "./DashboardAiUsageSummaryCard";
import { DashboardRunSummaryCard } from "./DashboardRunSummaryCard";

export function DashboardMetricGrid(props: Readonly<{ summary: TelemetryDashboardSummaryDto | undefined }>) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <DashboardRunSummaryCard summary={props.summary} />
      <DashboardAiUsageSummaryCard summary={props.summary} />
    </section>
  );
}
