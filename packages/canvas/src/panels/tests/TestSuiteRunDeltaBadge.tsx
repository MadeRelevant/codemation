"use client";

import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";

interface TestSuiteRunDeltaBadgeProps {
  /** Difference between current-run and previous-run mean score, on the 0..1 scale. `null` = no comparison available. */
  readonly delta: number | null;
}

/**
 * Tiny "+/− N% with arrow" badge shown alongside metric names in the previous-run comparison.
 * Color-coded: green up = improvement, red down = regression, neutral when within ±0.05%.
 *
 * Quantizes near-zero deltas to a flat arrow so floating-point jitter doesn't surface as a
 * misleading direction-arrow (e.g. `+0.0001%` → flat instead of green).
 */
export function TestSuiteRunDeltaBadge(props: TestSuiteRunDeltaBadgeProps) {
  if (props.delta === null) {
    return <span className="font-mono text-[10px] text-muted-foreground">no comparison</span>;
  }
  const pct = props.delta * 100;
  const direction: "up" | "down" | "flat" = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";
  const colorClass =
    direction === "up" ? "text-emerald-600 dark:text-emerald-400" : direction === "down" ? "text-destructive" : "";
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : ArrowRight;
  return (
    <span className={`flex items-center gap-1 font-mono ${colorClass}`} aria-label="delta vs previous run">
      <Icon className="size-3" />
      <span>
        {sign}
        {pct.toFixed(1)}%
      </span>
    </span>
  );
}
