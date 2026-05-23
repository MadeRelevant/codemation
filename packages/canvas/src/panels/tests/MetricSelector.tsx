"use client";

import type { AssertionMetricTrendDto } from "@codemation/host/dto";
import { useMemo } from "react";

import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";

import { Button } from "@codemation/ui";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@codemation/ui";

interface MetricSelectorProps {
  /**
   * Available metric names to choose from. Sourced from the trends endpoint hit without a names
   * filter — `perSuiteRun` is used to compute a "lifetime mean" hint shown next to each name so
   * users can scan for the assertions that vary the most before checking them.
   */
  readonly availableMetrics: ReadonlyArray<AssertionMetricTrendDto>;
  readonly selected: ReadonlySet<string>;
  readonly onChange: (next: ReadonlySet<string>) => void;
  readonly isLoading?: boolean;
}

/**
 * Multi-select dropdown for picking which assertion metrics to plot as additional trend lines
 * in {@link TestSuitePassRateChart}. Backed by a radix DropdownMenu (so the eslint guard against
 * native `<select>` is satisfied) and keyed by the canonical assertion name (which is also the
 * `<Line>` `dataKey` in the chart). State is owned upstream — this component is stateless and
 * just renders the current set + raises change events.
 */
export function MetricSelector(props: MetricSelectorProps) {
  const sorted = useMemo(
    () => [...props.availableMetrics].sort((a, b) => a.name.localeCompare(b.name)),
    [props.availableMetrics],
  );
  const selectedCount = props.selected.size;

  const triggerLabel = (() => {
    if (props.isLoading) return "Loading metrics…";
    if (sorted.length === 0) return "No assertion metrics yet";
    if (selectedCount === 0) return "Add metric lines";
    if (selectedCount === 1) return `1 metric selected`;
    return `${selectedCount} metrics selected`;
  })();

  function toggle(name: string): void {
    const next = new Set(props.selected);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    props.onChange(next);
  }

  function clear(): void {
    props.onChange(new Set());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 justify-between gap-1 px-2 text-[11px] font-normal"
          disabled={!props.isLoading && sorted.length === 0}
          data-testid="tests-panel-metric-selector"
          aria-label="Select assertion metrics to plot"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Plot mean score over time</span>
          {selectedCount > 0 ? (
            <button
              type="button"
              className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                clear();
              }}
            >
              Clear
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sorted.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No assertion metrics found yet. Run tests with assertion-emitting nodes to populate this list.
          </div>
        ) : (
          sorted.map((metric) => {
            const lifetimeMean = computeLifetimeMean(metric);
            return (
              <DropdownMenuCheckboxItem
                key={metric.name}
                checked={props.selected.has(metric.name)}
                onSelect={(e) => {
                  // Keep the dropdown open while the user picks multiple metrics.
                  e.preventDefault();
                  toggle(metric.name);
                }}
              >
                <span className="flex w-full items-center justify-between gap-2 pr-1">
                  <span className="truncate">{metric.name}</span>
                  {lifetimeMean !== null ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {(lifetimeMean * 100).toFixed(0)}%
                    </span>
                  ) : null}
                </span>
              </DropdownMenuCheckboxItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Sample-weighted lifetime mean across all suite runs for one metric. Returns `null` when the
 * metric has no data yet (so the UI doesn't render `0%` for an unmeasured baseline).
 */
function computeLifetimeMean(trend: AssertionMetricTrendDto): number | null {
  let sum = 0;
  let total = 0;
  for (const point of trend.perSuiteRun) {
    sum += point.meanScore * point.sampleCount;
    total += point.sampleCount;
  }
  if (total === 0) return null;
  return sum / total;
}
