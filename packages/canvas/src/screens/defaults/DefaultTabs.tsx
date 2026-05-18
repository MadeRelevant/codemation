"use client";

import type { WorkflowDetailTabsSlotContext } from "@codemation/canvas-core";
import { Button } from "../../components/ui/button";
import { WorkflowDetailScreenCanvasTabs } from "../WorkflowDetailScreenCanvasTabs";

/**
 * Default tabs slot — renders the floating tab strip (Live / Executions / Tests)
 * and the "Copy to live" button, exactly as WorkflowDetailScreen does today.
 */
export function DefaultTabs(
  props: Readonly<{ ctx: WorkflowDetailTabsSlotContext; canCopySelectedRunToLive: boolean; onCopyToLive: () => void }>,
) {
  const { ctx } = props;
  return (
    <>
      <WorkflowDetailScreenCanvasTabs
        activeCanvasTab={ctx.activeCanvasTab}
        onSelectLive={ctx.onSelectLive}
        onSelectExecutions={ctx.onSelectExecutions}
        onSelectTests={ctx.onSelectTests}
      />
      {props.canCopySelectedRunToLive ? (
        <Button
          type="button"
          data-testid="canvas-copy-to-live-button"
          size="sm"
          className="pointer-events-auto h-8 px-3 text-xs font-extrabold"
          onClick={props.onCopyToLive}
        >
          Copy to live
        </Button>
      ) : null}
    </>
  );
}
