"use client";

import { deriveAssertionPassed, DEFAULT_ASSERTION_PASS_THRESHOLD } from "@codemation/core/contracts";
import type { TestAssertionDto } from "@codemation/host/dto";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { useState } from "react";

import { ExpandableJsonValue } from "./ExpandableJsonValue";

const ERRORED_BADGE = "bg-purple-100 text-purple-900 dark:bg-purple-950/30 dark:text-purple-200";
const PASSED_BADGE = "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200";
const FAILED_BADGE = "bg-red-100 text-red-900 dark:bg-red-950/30 dark:text-red-200";

function badgeFor(a: TestAssertionDto): string {
  if (a.errored) return ERRORED_BADGE;
  return deriveAssertionPassed(a) ? PASSED_BADGE : FAILED_BADGE;
}

function labelFor(a: TestAssertionDto): string {
  if (a.errored) return "errored";
  return deriveAssertionPassed(a) ? "pass" : "fail";
}

export function TestAssertionRow(props: Readonly<{ assertion: TestAssertionDto }>) {
  const a = props.assertion;
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const hasDetails = a.details && Object.keys(a.details).length > 0;
  const showThreshold = a.passThreshold !== undefined && a.passThreshold !== DEFAULT_ASSERTION_PASS_THRESHOLD;

  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-sm" data-testid={`test-assertion-row-${a.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{a.name}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${badgeFor(a)}`}
        >
          <span>{labelFor(a)}</span>
          <span className="font-mono text-[10px] opacity-80">{a.score.toFixed(2)}</span>
        </span>
      </div>
      {showThreshold ? (
        <div className="text-[10px] font-mono text-muted-foreground">
          threshold: {a.passThreshold!.toFixed(2)} ({a.score.toFixed(2)} {a.score >= a.passThreshold! ? ">=" : "<"}{" "}
          {a.passThreshold!.toFixed(2)})
        </div>
      ) : null}
      {a.message ? <div className="text-xs text-muted-foreground">{a.message}</div> : null}
      {a.expected !== undefined || a.actual !== undefined ? (
        <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">expected</div>
            <ExpandableJsonValue value={a.expected} />
          </div>
          <div>
            <div className="text-muted-foreground">actual</div>
            <ExpandableJsonValue value={a.actual} />
          </div>
        </div>
      ) : null}
      {hasDetails ? (
        <div className="mt-2 flex flex-col gap-1">
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
            type="button"
          >
            <ChevronRight
              size={12}
              strokeWidth={2}
              className={`transition-transform ${detailsExpanded ? "rotate-90" : ""}`}
            />
            <span className="underline">details</span>
          </button>
          {detailsExpanded ? (
            <pre className="overflow-x-auto rounded bg-muted/40 px-2 py-1 text-xs">
              {JSON.stringify(a.details, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
