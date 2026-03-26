"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

import { WorkflowActivationErrorDialog } from "./WorkflowActivationErrorDialog";

export type WorkflowActivationHeaderControlProps = Readonly<{
  active: boolean;
  pending: boolean;
  onActiveChange: (next: boolean) => void;
  alertLines: ReadonlyArray<string> | null;
  onDismissAlert: () => void;
  /**
   * `shell` — app header row (green track when active). `canvas` — legacy floating chrome on the canvas.
   */
  variant?: "shell" | "canvas";
  /** When false, only the switch row is rendered (errors shown by the parent, e.g. under the shell header). */
  showErrorAlert?: boolean;
}>;

export function WorkflowActivationHeaderControl(props: WorkflowActivationHeaderControlProps) {
  const variant = props.variant ?? "canvas";
  const showErrorAlert = props.showErrorAlert ?? true;
  const isShell = variant === "shell";
  return (
    <div className="pointer-events-auto flex min-w-0 flex-col gap-2">
      <div
        data-testid="workflow-activation-control"
        className={cn(
          "pointer-events-auto flex items-center gap-2",
          isShell
            ? "py-0"
            : "rounded-md border border-border/60 bg-background/90 px-2.5 py-1.5 shadow-sm backdrop-blur-sm",
        )}
      >
        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">Active</span>
        {props.pending ? (
          <Loader2
            className="size-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
            data-testid="workflow-activation-pending-indicator"
          />
        ) : null}
        <Switch
          checked={props.active}
          onCheckedChange={props.onActiveChange}
          disabled={props.pending}
          aria-label={props.active ? "Deactivate workflow" : "Activate workflow"}
          data-testid="workflow-activation-switch"
          className={cn(
            isShell &&
              props.active &&
              "data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 dark:data-[state=checked]:bg-emerald-600",
          )}
        />
      </div>
      {showErrorAlert && props.alertLines && props.alertLines.length > 0 ? (
        <WorkflowActivationErrorDialog open alertLines={props.alertLines} onDismiss={props.onDismissAlert} />
      ) : null}
    </div>
  );
}
