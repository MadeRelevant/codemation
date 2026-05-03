"use client";

import type { TestAssertionDto, TestSuiteChildRunDto } from "@codemation/host/dto";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { TestAssertionRow } from "./TestAssertionRow";
import { TestSuiteCaseStatusIcon, statusLabelFor } from "./TestSuiteCaseStatusIcon";

interface TestSuiteCaseRowProps {
  readonly workflowId: string;
  readonly run: TestSuiteChildRunDto;
  readonly assertions: ReadonlyArray<TestAssertionDto>;
}

/**
 * One row per dispatched test case. Driven by the `Run` row (so queued / running cases show
 * up immediately, before any assertion has been emitted), with assertion rows nested
 * underneath as they arrive.
 *
 * Rules of thumb:
 *   - Auto-opens for `failed` runs and runs with at least one fail/error assertion — that's
 *     where the user wants to look first.
 *   - The label header reads "[Stress case #14] (#15)": the author-supplied label when present,
 *     plus the canonical case index for power-user cross-reference.
 *   - "Open run ↗" link opens the full run inspector in a new tab.
 */
export function TestSuiteCaseRow(props: TestSuiteCaseRowProps) {
  const { workflowId, run, assertions } = props;
  const passCount = assertions.filter((a) => a.status === "pass").length;
  const failCount = assertions.filter((a) => a.status === "fail").length;
  const errorCount = assertions.filter((a) => a.status === "error").length;
  const total = assertions.length;
  const shouldAutoOpen = run.status === "failed" || failCount > 0 || errorCount > 0;
  const [open, setOpen] = useState(shouldAutoOpen);
  const runHref = buildRunInspectorHref(workflowId, run.runId);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className="grid items-center gap-3 px-6 py-2 text-sm transition-colors hover:bg-muted/30"
        style={{ gridTemplateColumns: "auto minmax(0,1fr) auto auto auto" }}
      >
        <CollapsibleTrigger
          data-testid={`test-case-row-${run.runId}`}
          className="flex shrink-0 cursor-pointer items-center"
          aria-label={open ? "Collapse case" : "Expand case"}
        >
          <ChevronRight
            size={14}
            strokeWidth={2}
            className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        </CollapsibleTrigger>
        <div className="flex min-w-0 items-center gap-2">
          <TestSuiteCaseStatusIcon status={run.status} className="size-4 shrink-0" />
          <span className="truncate font-semibold" title={run.testCaseLabel ?? `Case #${run.testCaseIndex + 1}`}>
            {run.testCaseLabel ?? `Case #${run.testCaseIndex + 1}`}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{run.testCaseIndex + 1}</span>
        </div>
        <span className="text-xs text-muted-foreground">{statusLabelFor(run.status)}</span>
        <span className="font-mono text-xs">
          {total === 0 ? (
            <span className="text-muted-foreground">{run.status === "running" ? "…" : "—"}</span>
          ) : (
            <>
              {passCount}/{total}
              {errorCount > 0 ? <span className="ml-1 text-purple-700">·{errorCount}err</span> : null}
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
            {run.status === "completed" || run.status === "failed"
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
