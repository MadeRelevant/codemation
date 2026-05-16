"use client";

import type { WorkflowNodeDto } from "@codemation/host/dto";

import { Button } from "../components/ui/button";

import { TestsPanel } from "../panels/tests/TestsPanel";

interface WorkflowDetailScreenTestsViewProps {
  readonly workflowId: string;
  readonly workflowNodes: ReadonlyArray<WorkflowNodeDto>;
  readonly onSwitchToLive: () => void;
  readonly onSwitchToExecutions: () => void;
  readonly autoStartTriggerNodeId?: string;
}

/**
 * Tests-mode of the workflow detail screen — fully replaces the canvas/inspector layout. Lifted
 * out of {@link WorkflowDetailScreen} to keep that file under the per-file line cap and to keep
 * the runtime decision (live vs executions vs tests) explicit at the top of the screen.
 */
export function WorkflowDetailScreenTestsView(props: WorkflowDetailScreenTestsViewProps) {
  return (
    <main className="h-full w-full min-h-0 overflow-hidden bg-muted/40">
      <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
        {/*
         * Tabs sit in flow at the top of the column rather than `absolute` like the canvas tabs.
         * The canvas tabs float over the empty top of the workflow diagram (no content to cover);
         * the Tests view's panel has its own header (trigger picker + Run tests) directly under
         * these tabs, so absolutely-positioned tabs ended up overlapping the panel header.
         */}
        <div className="flex shrink-0 items-center justify-center px-3 pt-3 pb-2">
          <div className="flex overflow-hidden rounded-lg border border-border bg-card/95 shadow-md ring-1 ring-foreground/10">
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
        <div className="min-h-0 flex-1 overflow-hidden">
          <TestsPanel
            workflowId={props.workflowId}
            workflowNodes={props.workflowNodes}
            autoStartTriggerNodeId={props.autoStartTriggerNodeId}
          />
        </div>
      </section>
    </main>
  );
}
