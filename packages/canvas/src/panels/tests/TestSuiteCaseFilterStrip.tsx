"use client";

import { Button } from "@/components/ui/button";

import type { TestSuiteCaseFilter } from "./TestSuiteCaseFilter";

interface TestSuiteCaseFilterStripProps {
  readonly value: TestSuiteCaseFilter;
  readonly onChange: (next: TestSuiteCaseFilter) => void;
  readonly counts: Readonly<{
    all: number;
    passing: number;
    failing: number;
    errored: number;
    inFlight: number;
  }>;
}

interface FilterChip {
  readonly value: TestSuiteCaseFilter;
  readonly label: string;
  readonly count: number;
}

/**
 * Filter chips above the test-case tree-table. Lets users narrow to passing / failing /
 * errored / in-flight cases when a suite has many cases. Counts are computed by the parent
 * via {@link TestSuiteCaseFilterEngine.counts} so the chip labels stay in sync with the
 * actual filter logic.
 */
export function TestSuiteCaseFilterStrip(props: TestSuiteCaseFilterStripProps) {
  const chips: ReadonlyArray<FilterChip> = [
    { value: "all", label: "All", count: props.counts.all },
    { value: "passing", label: "Passing", count: props.counts.passing },
    { value: "failing", label: "Failing", count: props.counts.failing },
    { value: "errored", label: "Errored", count: props.counts.errored },
    { value: "inFlight", label: "In flight", count: props.counts.inFlight },
  ];

  return (
    <div
      data-testid="test-suite-case-filter-strip"
      className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/20 px-6 py-2"
    >
      {chips.map((chip) => {
        const isActive = props.value === chip.value;
        const isEmpty = chip.value !== "all" && chip.count === 0;
        return (
          <Button
            key={chip.value}
            type="button"
            data-testid={`test-suite-case-filter-${chip.value}`}
            variant={isActive ? "default" : "outline"}
            size="sm"
            disabled={isEmpty}
            className="h-7 px-2.5 text-[11px] font-bold"
            onClick={() => props.onChange(chip.value)}
            aria-pressed={isActive}
          >
            {chip.label}
            <span
              className={`ml-1.5 rounded px-1 py-0 font-mono text-[10px] tabular-nums ${
                isActive ? "bg-background/30 text-background" : "bg-muted/60 text-muted-foreground"
              }`}
            >
              {chip.count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
