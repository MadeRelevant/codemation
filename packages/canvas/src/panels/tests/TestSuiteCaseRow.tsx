"use client";

import { deriveAssertionPassed } from "@codemation/core/contracts";
import type { TestAssertionDto, TestSuiteChildRunDto } from "@codemation/host/dto";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";

import { TestAssertionRow } from "./TestAssertionRow";
import { TestSuiteCaseStatusIcon, resolveDisplayedCaseStatus, statusLabelFor } from "./TestSuiteCaseStatusIcon";

interface TestSuiteCaseRowProps {
  readonly workflowId: string;
  readonly run: TestSuiteChildRunDto;
  readonly assertions: ReadonlyArray<TestAssertionDto>;
  /** Controlled-by-parent expansion state so Collapse all / Expand all on the tree-table can broadcast. */
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}

/**
 * One row per dispatched test case. Driven by the `Run` row (so queued / running cases show
 * up immediately, before any assertion has been emitted), with assertion rows nested
 * underneath as they arrive.
 *
 * Expansion state is controlled by the parent {@link TestSuiteRunDetailTreeTable} so the
 * Collapse all / Expand all controls and the auto-open-on-failure heuristic share one source
 * of truth.
 */
export function TestSuiteCaseRow(props: TestSuiteCaseRowProps) {
  const { workflowId, run, assertions, isOpen, onToggle } = props;
  // Pass/fail derives from `score >= (passThreshold ?? 0.5)`; `errored` is its own bucket.
  const erroredCount = assertions.filter((a) => a.errored === true).length;
  const passCount = assertions.filter((a) => deriveAssertionPassed(a)).length;
  const total = assertions.length;
  // `displayedStatus` is the assertion-rollup-corrected status (preferred); `run.status` is
  // the engine status which reports `completed` even for cases with failed assertions.
  const displayedStatus = resolveDisplayedCaseStatus(run);
  const isInFlight = displayedStatus === "running" || displayedStatus === "queued";
  const isTerminal = !isInFlight;
  const runHref = buildRunInspectorHref(workflowId, run.runId);

  return (
    <Collapsible open={isOpen} onOpenChange={() => onToggle()}>
      <div
        className="grid items-center gap-3 px-6 py-2 text-sm transition-colors hover:bg-muted/30"
        style={{ gridTemplateColumns: "auto minmax(0,1fr) auto auto auto" }}
      >
        <CollapsibleTrigger
          data-testid={`test-case-row-${run.runId}`}
          className="flex shrink-0 cursor-pointer items-center"
          aria-label={isOpen ? "Collapse case" : "Expand case"}
        >
          <ChevronRight
            size={14}
            strokeWidth={2}
            className={`text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </CollapsibleTrigger>
        <div className="flex min-w-0 items-center gap-2">
          <TestSuiteCaseStatusIcon status={displayedStatus} className="size-4 shrink-0" />
          <span className="truncate font-semibold" title={run.testCaseLabel ?? `Case #${run.testCaseIndex + 1}`}>
            {run.testCaseLabel ?? `Case #${run.testCaseIndex + 1}`}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{run.testCaseIndex + 1}</span>
        </div>
        <span className="text-xs text-muted-foreground">{statusLabelFor(displayedStatus)}</span>
        <span className="font-mono text-xs">
          {total === 0 ? (
            <span className="text-muted-foreground">{isInFlight ? "…" : "—"}</span>
          ) : (
            <>
              {passCount}/{total}
              {erroredCount > 0 ? <span className="ml-1 text-purple-700">·{erroredCount}err</span> : null}
            </>
          )}
        </span>
        <a
          href={runHref}
          target="_blank"
          rel="noreferrer"
          data-testid={`test-case-open-run-${run.runId}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
          title="Open run in new tab"
          // Click on the link must NOT toggle the collapse — stop the row's parent gesture.
          onClick={(e) => e.stopPropagation()}
        >
          Open run
          <ExternalLink size={10} strokeWidth={2.5} />
        </a>
      </div>
      <CollapsibleContent>
        {assertions.length === 0 ? (
          <div className="px-12 py-2 text-xs text-muted-foreground">
            {isTerminal
              ? "No assertions emitted (the run finished without reaching an Assertion node)."
              : "Waiting for assertions to arrive…"}
          </div>
        ) : (
          <ul className="divide-y divide-border bg-muted/20">
            {assertions.map((a) => (
              <TestAssertionRow key={a.id} assertion={a} />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function buildRunInspectorHref(workflowId: string, runId: string): string {
  // The run inspector is the existing Executions tab on the workflow detail screen — opening
  // the workflow with `?run=<runId>` selects that run and shows the inspector tree.
  const params = new URLSearchParams({ run: runId });
  return `/workflows/${encodeURIComponent(workflowId)}?${params.toString()}`;
}
