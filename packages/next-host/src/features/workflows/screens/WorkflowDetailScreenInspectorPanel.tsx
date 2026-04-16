import { PanelBottomClose, PanelBottomOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WorkflowExecutionInspector } from "../components/workflowDetail/WorkflowExecutionInspector";
import type { WorkflowDetailControllerResult } from "../hooks/workflowDetail/useWorkflowDetailController";

export function WorkflowDetailScreenInspectorPanel(props: Readonly<{ controller: WorkflowDetailControllerResult }>) {
  const { controller } = props;
  return (
    <div
      className={cn(
        "grid min-h-0 min-w-0 border-t border-border bg-card",
        controller.isPanelCollapsed ? "grid-rows-[36px]" : "grid-rows-[36px_minmax(0,1fr)]",
      )}
    >
      <div
        data-testid="workflow-detail-inspector-resize-handle"
        className={cn(
          "flex cursor-ns-resize select-none items-center justify-between gap-3 bg-card px-3 py-0",
          !controller.isPanelCollapsed && "border-b border-border",
        )}
        onMouseDown={(event) => {
          event.preventDefault();
          controller.startInspectorResize(event.clientY);
        }}
      >
        <div className="text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Execution inspector</div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-7 shrink-0"
          onClick={(event) => {
            event.stopPropagation();
            controller.toggleInspectorPanel();
          }}
          aria-label={controller.isPanelCollapsed ? "Open execution inspector" : "Collapse execution inspector"}
        >
          {controller.isPanelCollapsed ? (
            <PanelBottomOpen size={15} strokeWidth={1.9} />
          ) : (
            <PanelBottomClose size={15} strokeWidth={1.9} />
          )}
        </Button>
      </div>
      {!controller.isPanelCollapsed ? (
        <div className="min-h-0 min-w-0 overflow-hidden">
          <WorkflowExecutionInspector
            model={controller.inspectorModel}
            formatting={controller.inspectorFormatting}
            actions={controller.inspectorActions}
          />
        </div>
      ) : null}
    </div>
  );
}
