"use client";

import { useEffect,type MouseEvent } from "react";

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
      className="credential-dialog-overlay users-dialog-overlay"
      onClick={backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-regenerate-title"
      data-testid="users-regenerate-dialog"
    >
      <div className="credential-dialog users-dialog">
        <div className="credential-dialog__header">
          <h2 id="users-regenerate-title" className="credential-dialog__title">
            Regenerate invite link
          </h2>
        </div>
        <div className="credential-dialog__body">
          {newUrl ? (
            <>
              <p className="credential-dialog__help" data-testid="users-regenerate-success-message">
                New link for {email}. Previous links stop working.
              </p>
              <input type="text" readOnly className="credential-dialog__input" value={newUrl} data-testid="users-regenerate-link-field" />
              <div className="users-dialog__row">
                <button
                  type="button"
                  className="credential-dialog__btn credential-dialog__btn--secondary"
                  data-testid="users-regenerate-copy-link"
                  onClick={onCopy}
                >
                  {copyFeedback ? "Copied" : "Copy link"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="credential-dialog__help" data-testid="users-regenerate-confirm-text">
                Generate a new seven-day link for <strong data-testid="users-regenerate-email">{email}</strong>? The current invite link will no longer work.
              </p>
              {errorMessage && (
                <div className="credential-dialog__error" data-testid="users-regenerate-error">
                  {errorMessage}
                </div>
              )}
            </>
          )}
        </div>
        <div className="credential-dialog__footer">
          <button
            type="button"
            className="credential-dialog__btn credential-dialog__btn--secondary"
            data-testid="users-regenerate-cancel"
            onClick={onClose}
          >
            {newUrl ? "Close" : "Cancel"}
          </button>
          {!newUrl && (
            <button
              type="button"
              className="credential-dialog__btn credential-dialog__btn--primary"
              data-testid="users-regenerate-confirm"
              disabled={isSubmitting}
              onClick={onConfirm}
            >
              {isSubmitting ? "Working…" : "Regenerate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
