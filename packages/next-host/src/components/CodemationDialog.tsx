"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const maxWidthBySize = {
  narrow: "sm:max-w-lg",
  wide: "sm:max-w-2xl",
  full: "sm:max-w-[min(92vw,960px)]",
} as const;

export type CodemationDialogSize = keyof typeof maxWidthBySize;

export type CodemationDialogRootProps = Readonly<{
  children: React.ReactNode;
  onClose: () => void;
  /** Root `data-testid` (applied to the dialog panel). */
  testId?: string;
  /** `dialog` (default) or `alertdialog` for confirmations. */
  role?: "dialog" | "alertdialog";
  /** Max width preset; default `wide`. */
  size?: CodemationDialogSize;
  /** Extra classes on the Radix panel (e.g. `max-h-[min(90vh,640px)]`). */
  contentClassName?: string;
  /** Corner X to dismiss (Radix); default false — use `<CodemationDialog.Actions>` for explicit buttons. */
  showCloseButton?: boolean;
}>;

function CodemationDialogRoot({
  children,
  onClose,
  testId,
  role = "dialog",
  size = "wide",
  contentClassName,
  showCloseButton = false,
}: CodemationDialogRootProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={showCloseButton}
        data-testid={testId}
        role={role}
        aria-describedby={undefined}
        className={cn(
          "flex max-h-[min(92vh,900px)] flex-col gap-0 overflow-hidden p-0",
          maxWidthBySize[size],
          contentClassName,
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export type CodemationDialogTitleProps = Readonly<{
  children: React.ReactNode;
  className?: string;
}>;

/**
 * Do not set `id` on the underlying Radix `DialogTitle` — the dialog root assigns `titleId`
 * in context; overriding `id` breaks `aria-labelledby` and Radix dev warnings.
 */
function CodemationDialogTitle({ children, className }: CodemationDialogTitleProps) {
  return (
    <DialogTitle className={cn("m-0 shrink-0 border-b border-border px-4 py-3 text-base leading-none font-semibold", className)}>
      {children}
    </DialogTitle>
  );
}

export type CodemationDialogContentProps = Readonly<{
  children: React.ReactNode;
  className?: string;
}>;

function CodemationDialogContent({ children, className }: CodemationDialogContentProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-3 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type CodemationDialogActionsProps = Readonly<{
  children: React.ReactNode;
  /** Toolbar directly under the title (e.g. filters). Default is footer actions. */
  position?: "top" | "bottom";
  /** Flex alignment for the button row. */
  align?: "start" | "end" | "between";
  className?: string;
}>;

function CodemationDialogActions({
  children,
  position = "bottom",
  align = "end",
  className,
}: CodemationDialogActionsProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap gap-2 border-border bg-muted/30 px-4 py-3",
        position === "top" ? "border-b" : "border-t",
        align === "end" && "justify-end",
        align === "start" && "justify-start",
        align === "between" && "justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type CodemationDialogCompound = typeof CodemationDialogRoot & {
  Title: typeof CodemationDialogTitle;
  Content: typeof CodemationDialogContent;
  Actions: typeof CodemationDialogActions;
};

export const CodemationDialog = Object.assign(CodemationDialogRoot, {
  Title: CodemationDialogTitle,
  Content: CodemationDialogContent,
  Actions: CodemationDialogActions,
}) as CodemationDialogCompound;
