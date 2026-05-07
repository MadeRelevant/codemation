import type { ReactNode } from "react";

export function WorkflowInfoPopoverMetaRow(args: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      <span className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase opacity-80 whitespace-nowrap">
        {args.label}
      </span>
      <span className="break-all text-xs text-foreground">{args.value}</span>
    </div>
  );
}
