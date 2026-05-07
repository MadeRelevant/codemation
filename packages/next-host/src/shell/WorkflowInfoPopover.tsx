"use client";

import InfoIcon from "lucide-react/dist/esm/icons/info";

import type { WorkflowSummary } from "@codemation/host/dto";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkflowInfoPopoverMetaRow } from "./WorkflowInfoPopoverMetaRow";

export function WorkflowInfoPopover(
  args: Readonly<{
    workflow: WorkflowSummary;
    triggerType: string | undefined;
  }>,
) {
  const { workflow, triggerType } = args;
  const pathLabel = workflow.discoveryPathSegments.length > 0 ? workflow.discoveryPathSegments.join(" / ") : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Workflow information"
          data-testid="workflow-info-popover-trigger"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <InfoIcon size={16} strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <div className="mb-3 text-sm font-semibold leading-snug text-foreground">{workflow.name}</div>
        <WorkflowInfoPopoverMetaRow label="ID" value={workflow.id} />
        {pathLabel ? <WorkflowInfoPopoverMetaRow label="Path" value={pathLabel} /> : null}
        {triggerType ? <WorkflowInfoPopoverMetaRow label="Trigger" value={triggerType} /> : null}
        <WorkflowInfoPopoverMetaRow label="Status" value={workflow.active ? "Active" : "Inactive"} />
      </PopoverContent>
    </Popover>
  );
}
