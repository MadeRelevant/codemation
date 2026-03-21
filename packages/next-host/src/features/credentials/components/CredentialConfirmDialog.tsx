"use client";

import { useEffect, type ReactNode } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { Button } from "@/components/ui/button";

export type CredentialConfirmVariant = "danger" | "primary";

export type CredentialConfirmDialogProps = {
  title: string;
  titleElementId: string;
  testId: string;
  cancelTestId: string;
  confirmTestId: string;
  confirmLabel: string;
  confirmVariant: CredentialConfirmVariant;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
};

export function CredentialConfirmDialog({
  title,
  titleElementId,
  testId,
  cancelTestId,
  confirmTestId,
  confirmLabel,
  confirmVariant,
  onCancel,
  onConfirm,
  children,
}: CredentialConfirmDialogProps) {
  const handleBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onCancel();
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleElementId}
      data-testid={testId}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10">
        <div className="border-b border-border px-4 py-3">
          <h2 id={titleElementId} className="m-0 text-base font-semibold">
            {title}
          </h2>
        </div>
        <div className="max-h-[min(70vh,480px)] overflow-auto px-4 py-3 text-sm">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
          <Button type="button" variant="outline" data-testid={cancelTestId} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant === "danger" ? "destructive" : "default"}
            data-testid={confirmTestId}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
