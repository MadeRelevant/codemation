"use client";

import { Button } from "@/components/ui/button";
import { CodemationDialog } from "@/components/CodemationDialog";
import { InviteLinkCopyRow } from "./InviteLinkCopyRow";

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
  return (
    <CodemationDialog
      onClose={onClose}
      testId="users-regenerate-dialog"
      size="narrow"
      contentClassName="max-h-[min(90vh,640px)]"
    >
      <CodemationDialog.Title>Regenerate invite link</CodemationDialog.Title>
      <CodemationDialog.Content className="space-y-3">
        {newUrl ? (
          <>
            <p className="m-0 text-muted-foreground" data-testid="users-regenerate-success-message">
              New link for {email}. Previous links stop working.
            </p>
            <InviteLinkCopyRow
              url={newUrl}
              copyFeedback={copyFeedback}
              onCopy={onCopy}
              linkTestId="users-regenerate-link-field"
              copyTestId="users-regenerate-copy-link"
            />
          </>
        ) : (
          <>
            <p className="m-0 text-muted-foreground" data-testid="users-regenerate-confirm-text">
              Generate a new seven-day link for <strong data-testid="users-regenerate-email">{email}</strong>? The
              current invite link will no longer work.
            </p>
            {errorMessage ? (
              <div className="text-sm text-destructive" data-testid="users-regenerate-error">
                {errorMessage}
              </div>
            ) : null}
          </>
        )}
      </CodemationDialog.Content>
      <CodemationDialog.Actions>
        <Button type="button" variant="outline" data-testid="users-regenerate-cancel" onClick={onClose}>
          {newUrl ? "Close" : "Cancel"}
        </Button>
        {!newUrl ? (
          <Button type="button" data-testid="users-regenerate-confirm" disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? "Working…" : "Regenerate"}
          </Button>
        ) : null}
      </CodemationDialog.Actions>
    </CodemationDialog>
  );
}
