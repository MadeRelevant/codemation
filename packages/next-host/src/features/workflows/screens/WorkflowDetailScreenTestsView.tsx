"use client";

import type { WorkflowNodeDto } from "@codemation/host/dto";

import { Button } from "@/components/ui/button";

import { TestsPanel } from "../components/workflowDetail/tests/TestsPanel";

interface WorkflowDetailScreenTestsViewProps {
  readonly workflowId: string;
  readonly workflowNodes: ReadonlyArray<WorkflowNodeDto>;
  readonly onSwitchToLive: () => void;
  readonly onSwitchToExecutions: () => void;
}

/**
 * Tests-mode of the workflow detail screen — fully replaces the canvas/inspector layout. Lifted
 * out of {@link WorkflowDetailScreen} to keep that file under the per-file line cap and to keep
 * the runtime decision (live vs executions vs tests) explicit at the top of the screen.
 */
export function WorkflowDetailScreenTestsView(props: WorkflowDetailScreenTestsViewProps) {
  return (
    <main className="h-full w-full min-h-0 overflow-hidden bg-muted/40">
      <section className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
        <div className="pointer-events-none absolute top-3 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-2">
          <div className="pointer-events-auto flex overflow-hidden rounded-lg border border-border bg-card/95 shadow-md ring-1 ring-foreground/10">
            <Button
              type="button"
              data-testid="workflow-canvas-tab-live"
              variant="ghost"
              size="sm"
              className="h-8 rounded-none border-r border-border px-3 text-xs font-extrabold"
              onClick={props.onSwitchToLive}
            >
              Live workflow
            </Button>
            <Button
              type="button"
              data-testid="workflow-canvas-tab-executions"
              variant="ghost"
              size="sm"
              className="h-8 rounded-none border-r border-border px-3 text-xs font-extrabold"
              onClick={props.onSwitchToExecutions}
            >
              Executions
            </Button>
            <Button
              type="button"
              data-testid="workflow-canvas-tab-tests"
              variant="default"
              size="sm"
              className="h-8 rounded-none px-3 text-xs font-extrabold"
              aria-pressed
            >
              Tests
            </Button>
          </div>
        </div>
        <TestsPanel workflowId={props.workflowId} workflowNodes={props.workflowNodes} />
      </section>
    </main>
  );
}
