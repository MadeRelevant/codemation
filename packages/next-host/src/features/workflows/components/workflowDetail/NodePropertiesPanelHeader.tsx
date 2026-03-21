import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NodePropertiesPanelHeader(args: Readonly<{
  title: string;
  subtitle?: string;
  onClose: () => void;
}>) {
  const { onClose, subtitle, title } = args;
  return (
    <div
      data-testid="node-properties-panel-header"
      className="flex shrink-0 items-start justify-between gap-2.5 border-b border-border bg-muted/40 px-3 pt-3 pb-2.5"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase opacity-90">
          Node properties
        </div>
        <div
          data-testid="node-properties-panel-title"
          className="mt-1 text-sm leading-tight font-extrabold break-words text-foreground"
        >
          {title}
        </div>
        {subtitle ? (
          <div
            data-testid="node-properties-panel-subtitle"
            className="mt-1 break-all font-mono text-[11px] text-muted-foreground"
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        data-testid="node-properties-panel-close"
        aria-label="Close node properties"
        onClick={onClose}
        className="shrink-0"
      >
        <X size={16} strokeWidth={2} />
      </Button>
    </div>
  );
}
