"use client";

import { useEffect, type FormEvent, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UsersInviteDialogProps = Readonly<{
  email: string;
  setEmail: (v: string) => void;
  errorMessage: string | null;
  successUrl: string | null;
  isSubmitting: boolean;
  copyFeedback: boolean;
  onSubmit: () => void;
  onCopy: () => void;
  onClose: () => void;
}>;

export function UsersInviteDialog({
  email,
  setEmail,
  errorMessage,
  successUrl,
  isSubmitting,
  copyFeedback,
  onSubmit,
  onCopy,
  onClose,
}: UsersInviteDialogProps) {
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

  const inviteFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-invite-title"
      data-testid="users-invite-dialog"
    >
      <div className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10">
        <div className="border-b border-border px-4 py-3">
          <h2 id="users-invite-title" className="m-0 text-base font-semibold">
            Invite user
          </h2>
        </div>
        {successUrl ? (
          <>
            <div className="space-y-3 px-4 py-3 text-sm">
              <p className="m-0 text-muted-foreground" data-testid="users-invite-success-message">
                Share this link; it expires in seven days.
              </p>
              <Input type="text" readOnly value={successUrl} data-testid="users-invite-link-field" className="font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" data-testid="users-invite-copy-link" onClick={onCopy}>
                  {copyFeedback ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
              <Button type="button" variant="outline" data-testid="users-invite-cancel" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <form data-testid="users-invite-form" onSubmit={inviteFormSubmit} className="flex flex-col">
            <div className="space-y-3 px-4 py-3 text-sm">
              <div className="space-y-2">
                <Label htmlFor="users-invite-email">Email</Label>
                <Input
                  id="users-invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="users-invite-email-input"
                  placeholder="colleague@company.com"
                  autoComplete="off"
                />
              </div>
              {errorMessage ? (
                <div className="text-sm text-destructive" data-testid="users-invite-error">
                  {errorMessage}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
              <Button type="button" variant="outline" data-testid="users-invite-cancel" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" data-testid="users-invite-submit" disabled={isSubmitting || !email.trim().includes("@")}>
                {isSubmitting ? "Sending…" : "Create invite"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
