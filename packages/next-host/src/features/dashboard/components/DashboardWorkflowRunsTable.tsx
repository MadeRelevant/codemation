"use client";

import type { TelemetryDashboardRunsDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HumanFriendlyTimestampFormatter } from "../../lib/HumanFriendlyTimestampFormatter";
import { DashboardCostAmountFormatter } from "../lib/DashboardCostAmountFormatter";
import { DashboardDateTimeFormatter } from "../lib/DashboardDateTimeFormatter";
import { DashboardStatusPresentation } from "../lib/DashboardStatusPresentation";
import { DashboardChartCard } from "./DashboardChartCard";

export function DashboardWorkflowRunsTable(
  props: Readonly<{
    runs: TelemetryDashboardRunsDto | undefined;
    workflowNamesById: Readonly<Record<string, string>>;
    onPageChange: (page: number) => void;
  }>,
) {
  const totalCount = props.runs?.totalCount ?? 0;
  const page = props.runs?.page ?? 1;
  const pageSize = props.runs?.pageSize ?? 10;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <DashboardChartCard
      title="Matching workflow runs"
      description="Browse the concrete runs that match the current filters and jump straight into a failed execution."
      testId="dashboard-workflow-runs-card"
    >
      <div className="space-y-4">
        <Table data-testid="dashboard-workflow-runs-table">
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Total cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.runs === undefined ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading workflow runs…
                </TableCell>
              </TableRow>
            ) : props.runs.items.length ? (
              props.runs.items.map((run) => (
                <TableRow key={run.runId} data-testid={`dashboard-run-row-${run.runId}`}>
                  <TableCell title={DashboardDateTimeFormatter.formatTimestamp(run.startedAt)}>
                    {HumanFriendlyTimestampFormatter.formatRunListWhen(run.startedAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/workflows/${encodeURIComponent(run.workflowId)}?runId=${encodeURIComponent(run.runId)}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      data-testid={`dashboard-run-link-${run.runId}`}
                    >
                      {props.workflowNamesById[run.workflowId] ?? run.workflowId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="text-white"
                      style={{ backgroundColor: DashboardStatusPresentation.colorForStatus(run.status) }}
                    >
                      {DashboardStatusPresentation.labelForStatus(run.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{DashboardStatusPresentation.labelForOrigin(run.origin)}</Badge>
                  </TableCell>
                  <TableCell>{DashboardDateTimeFormatter.formatDuration(run.startedAt, run.finishedAt)}</TableCell>
                  <TableCell data-testid={`dashboard-run-total-cost-${run.runId}`}>
                    {DashboardCostAmountFormatter.formatTotals(run.costs)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No workflow runs match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground" data-testid="dashboard-runs-pagination-summary">
            {totalCount === 0
              ? "0 results"
              : `${String((page - 1) * pageSize + 1)}-${String(Math.min(page * pageSize, totalCount))} of ${String(totalCount)}`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => props.onPageChange(page - 1)}
              data-testid="dashboard-runs-previous-page"
            >
              Previous
            </Button>
            <div className="text-sm text-muted-foreground" data-testid="dashboard-runs-page-indicator">
              {`Page ${String(page)} of ${String(pageCount)}`}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => props.onPageChange(page + 1)}
              data-testid="dashboard-runs-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </DashboardChartCard>
  );
}
