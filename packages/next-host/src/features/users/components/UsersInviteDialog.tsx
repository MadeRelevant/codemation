"use client";

import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { CodemationDialog } from "@/components/CodemationDialog";
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
  const inviteFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <CodemationDialog onClose={onClose} testId="users-invite-dialog" size="narrow" contentClassName="max-h-[min(90vh,640px)]">
      <CodemationDialog.Title>Invite user</CodemationDialog.Title>
      {successUrl ? (
        <>
          <CodemationDialog.Content className="space-y-3">
            <p className="m-0 text-muted-foreground" data-testid="users-invite-success-message">
              Share this link; it expires in seven days.
            </p>
            <Input type="text" readOnly value={successUrl} data-testid="users-invite-link-field" className="font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" data-testid="users-invite-copy-link" onClick={onCopy}>
                {copyFeedback ? "Copied" : "Copy link"}
              </Button>
            </div>
          </CodemationDialog.Content>
          <CodemationDialog.Actions>
            <Button type="button" variant="outline" data-testid="users-invite-cancel" onClick={onClose}>
              Done
            </Button>
          </CodemationDialog.Actions>
        </>
      ) : (
        <form data-testid="users-invite-form" onSubmit={inviteFormSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CodemationDialog.Content className="space-y-3">
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
          </CodemationDialog.Content>
          <CodemationDialog.Actions>
            <Button type="button" variant="outline" data-testid="users-invite-cancel" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="users-invite-submit" disabled={isSubmitting || !email.trim().includes("@")}>
              {isSubmitting ? "Sending…" : "Create invite"}
            </Button>
          </CodemationDialog.Actions>
        </form>
      )}
    </CodemationDialog>
  );
}
