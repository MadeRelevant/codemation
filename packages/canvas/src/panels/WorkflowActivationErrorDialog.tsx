"use client";

import type { ReactNode } from "react";

import AlertCircle from "lucide-react/dist/esm/icons/alert-circle";

import { Button } from "@codemation/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@codemation/ui";
import { cn } from "@codemation/ui";

export function WorkflowActivationErrorDialog(
  props: Readonly<{
    open: boolean;
    title?: string;
    alertLines: ReadonlyArray<string>;
    onDismiss: () => void;
  }>,
): ReactNode {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) {
          props.onDismiss();
        }
      }}
    >
      <DialogContent
        showCloseButton
        data-testid="workflow-activation-error-dialog"
        className={cn("gap-0 overflow-hidden p-0 sm:max-w-lg", "ring-1 ring-destructive/20")}
      >
        <DialogHeader className="flex flex-row gap-4 p-6 text-left sm:items-start">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={2.25} aria-hidden />
          <div className="flex min-w-0 flex-col gap-2">
            <DialogTitle className="text-base font-semibold">
              {props.title ?? "Could not update activation"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-muted-foreground">
                {props.alertLines.length === 1 ? (
                  <p className="text-sm leading-snug" data-testid="workflow-activation-error-message">
                    {props.alertLines[0]}
                  </p>
                ) : (
                  <ul
                    className="list-inside list-disc space-y-1.5 text-sm leading-snug"
                    data-testid="workflow-activation-error-list"
                  >
                    {props.alertLines.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="mx-0 mb-0 rounded-none border-t border-border bg-muted/40 px-6 py-4 sm:justify-end">
          <Button type="button" data-testid="workflow-activation-error-dialog-ok" onClick={props.onDismiss}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
