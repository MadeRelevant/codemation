"use client";

import { useEffect,type FormEvent,type MouseEvent } from "react";

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
      className="credential-dialog-overlay users-dialog-overlay"
      onClick={backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-invite-title"
      data-testid="users-invite-dialog"
    >
      <div className="credential-dialog users-dialog">
        <div className="credential-dialog__header">
          <h2 id="users-invite-title" className="credential-dialog__title">
            Invite user
          </h2>
        </div>
        {successUrl ? (
          <>
            <div className="credential-dialog__body">
              <p className="credential-dialog__help" data-testid="users-invite-success-message">
                Share this link; it expires in seven days.
              </p>
              <input
                type="text"
                readOnly
                className="credential-dialog__input"
                value={successUrl}
                data-testid="users-invite-link-field"
              />
              <div className="users-dialog__row">
                <button
                  type="button"
                  className="credential-dialog__btn credential-dialog__btn--secondary"
                  data-testid="users-invite-copy-link"
                  onClick={onCopy}
                >
                  {copyFeedback ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
            <div className="credential-dialog__footer">
              <button
                type="button"
                className="credential-dialog__btn credential-dialog__btn--secondary"
                data-testid="users-invite-cancel"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form data-testid="users-invite-form" onSubmit={inviteFormSubmit}>
            <div className="credential-dialog__body">
              <label className="credential-dialog__field">
                <span className="credential-dialog__label">Email</span>
                <input
                  type="email"
                  className="credential-dialog__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="users-invite-email-input"
                  placeholder="colleague@company.com"
                  autoComplete="off"
                />
              </label>
              {errorMessage && (
                <div className="credential-dialog__error" data-testid="users-invite-error">
                  {errorMessage}
                </div>
              )}
            </div>
            <div className="credential-dialog__footer">
              <button
                type="button"
                className="credential-dialog__btn credential-dialog__btn--secondary"
                data-testid="users-invite-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="credential-dialog__btn credential-dialog__btn--primary"
                data-testid="users-invite-submit"
                disabled={isSubmitting || !email.trim().includes("@")}
              >
                {isSubmitting ? "Sending…" : "Create invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
