"use client";

import { useState, type ReactNode } from "react";

import AlertCircle from "lucide-react/dist/esm/icons/alert-circle";
import Copy from "lucide-react/dist/esm/icons/copy";
import Check from "lucide-react/dist/esm/icons/check";

import { Button } from "@codemation/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@codemation/ui";
import { cn } from "@codemation/ui";

import type { WorkflowRunInternalError } from "@codemation/canvas-core";

/**
 * Modal shown when "Run workflow" surfaces a 500 (unhandled server error). Contains the
 * server-reported message and stack and a copy-to-clipboard button so the operator can
 * paste the trace into a bug report. Control-plane consumers override the canvas's
 * `onWorkflowRunInternalError` config hook and render their own UI (e.g. inject the error
 * into the agent chat) — this dialog is the OSS framework's default surface.
 */
export function WorkflowRunInternalErrorDialog(
  props: Readonly<{
    open: boolean;
    error: WorkflowRunInternalError | null;
    onDismiss: () => void;
  }>,
): ReactNode {
  const [copied, setCopied] = useState(false);
  const error = props.error;
  if (!error) {
    return null;
  }
  const fullText = formatErrorForCopy(error);
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (insecure context). The user can still select the text.
    }
  };
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
        data-testid="workflow-run-internal-error-dialog"
        className={cn("flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl", "ring-1 ring-destructive/20")}
      >
        <DialogHeader className="flex flex-row gap-4 p-6 text-left sm:items-start">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={2.25} aria-hidden />
          <div className="flex min-w-0 flex-col gap-2">
            <DialogTitle className="text-base font-semibold">Run workflow failed</DialogTitle>
            <DialogDescription asChild>
              <p
                className="break-words text-sm leading-snug text-muted-foreground"
                data-testid="workflow-run-internal-error-message"
              >
                {error.message}
              </p>
            </DialogDescription>
          </div>
        </DialogHeader>
        {(error.stack || error.cause) && (
          <div className="min-h-0 flex-1 overflow-auto border-t border-border bg-muted/30 px-6 py-3">
            <pre
              className="whitespace-pre-wrap break-all text-xs leading-snug text-muted-foreground"
              data-testid="workflow-run-internal-error-stack"
            >
              {error.stack}
              {error.cause ? `\n\nCaused by:\n${error.cause}` : ""}
            </pre>
          </div>
        )}
        <DialogFooter className="mx-0 mb-0 flex-row gap-2 rounded-none border-t border-border bg-muted/40 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            data-testid="workflow-run-internal-error-copy"
            onClick={() => void handleCopy()}
            className="gap-1.5"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            <span className="leading-none">{copied ? "Copied" : "Copy"}</span>
          </Button>
          <Button type="button" data-testid="workflow-run-internal-error-dismiss" onClick={props.onDismiss}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatErrorForCopy(error: WorkflowRunInternalError): string {
  const lines: string[] = [];
  if (error.name) {
    lines.push(`${error.name}: ${error.message}`);
  } else {
    lines.push(error.message);
  }
  if (error.stack) {
    lines.push("", error.stack);
  }
  if (error.cause) {
    lines.push("", "Caused by:", error.cause);
  }
  return lines.join("\n");
}
