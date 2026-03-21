"use client";

import { useEffect, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UsersRegenerateDialogProps = Readonly<{
  email: string;
  newUrl: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  copyFeedback: boolean;
  onConfirm: () => void;
  onCopy: () => void;
  onClose: () => void;
}>;

export function UsersRegenerateDialog({
  email,
  newUrl,
  errorMessage,
  isSubmitting,
  copyFeedback,
  onConfirm,
  onCopy,
  onClose,
}: UsersRegenerateDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const backdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-regenerate-title"
      data-testid="users-regenerate-dialog"
    >
      <div className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10">
        <div className="border-b border-border px-4 py-3">
          <h2 id="users-regenerate-title" className="m-0 text-base font-semibold">
            Regenerate invite link
          </h2>
        </div>
        <div className="space-y-3 px-4 py-3 text-sm">
          {newUrl ? (
            <>
              <p className="m-0 text-muted-foreground" data-testid="users-regenerate-success-message">
                New link for {email}. Previous links stop working.
              </p>
              <Input type="text" readOnly value={newUrl} data-testid="users-regenerate-link-field" className="font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" data-testid="users-regenerate-copy-link" onClick={onCopy}>
                  {copyFeedback ? "Copied" : "Copy link"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-muted-foreground" data-testid="users-regenerate-confirm-text">
                Generate a new seven-day link for <strong data-testid="users-regenerate-email">{email}</strong>? The current invite link will no longer work.
              </p>
              {errorMessage ? (
                <div className="text-sm text-destructive" data-testid="users-regenerate-error">
                  {errorMessage}
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
          <Button type="button" variant="outline" data-testid="users-regenerate-cancel" onClick={onClose}>
            {newUrl ? "Close" : "Cancel"}
          </Button>
          {!newUrl ? (
            <Button type="button" data-testid="users-regenerate-confirm" disabled={isSubmitting} onClick={onConfirm}>
              {isSubmitting ? "Working…" : "Regenerate"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
