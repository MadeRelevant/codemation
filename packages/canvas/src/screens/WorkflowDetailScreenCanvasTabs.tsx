"use client";

import { Button } from "@codemation/ui";

interface WorkflowDetailScreenCanvasTabsProps {
  readonly activeCanvasTab: "live" | "executions" | "tests";
  readonly onSelectLive: () => void;
  readonly onSelectExecutions: () => void;
  readonly onSelectTests: () => void;
}

/**
 * Floating tab strip rendered above the workflow canvas. Hosts the Live / Executions / Tests
 * toggle. Extracted so {@link WorkflowDetailScreen} stays under the per-file line cap.
 */
export function WorkflowDetailScreenCanvasTabs(props: WorkflowDetailScreenCanvasTabsProps) {
  return (
    <div className="pointer-events-auto flex overflow-hidden rounded-lg border border-border bg-card/95 shadow-md ring-1 ring-foreground/10">
      <Button
        type="button"
        data-testid="workflow-canvas-tab-live"
        variant={props.activeCanvasTab === "live" ? "default" : "ghost"}
        size="sm"
        className="h-8 rounded-none border-r border-border px-3 text-xs font-extrabold"
        onClick={props.onSelectLive}
        aria-pressed={props.activeCanvasTab === "live"}
      >
        Live workflow
      </Button>
      <Button
        type="button"
        data-testid="workflow-canvas-tab-executions"
        variant={props.activeCanvasTab === "executions" ? "default" : "ghost"}
        size="sm"
        className="h-8 rounded-none border-r border-border px-3 text-xs font-extrabold"
        onClick={props.onSelectExecutions}
        aria-pressed={props.activeCanvasTab === "executions"}
      >
        Executions
      </Button>
      <Button
        type="button"
        data-testid="workflow-canvas-tab-tests"
        variant={props.activeCanvasTab === "tests" ? "default" : "ghost"}
        size="sm"
        className="h-8 rounded-none px-3 text-xs font-extrabold"
        onClick={props.onSelectTests}
        aria-pressed={props.activeCanvasTab === "tests"}
      >
        Tests
      </Button>
    </div>
  );
}
