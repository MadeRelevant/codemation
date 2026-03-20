"use client";

import { useEffect, type ReactNode } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

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

  const confirmClass =
    confirmVariant === "danger"
      ? "credential-dialog__btn credential-dialog__btn--danger"
      : "credential-dialog__btn credential-dialog__btn--primary";

  return (
    <div
      className="credential-dialog-overlay"
      onClick={handleBackdropClick}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleElementId}
      data-testid={testId}
    >
      <div className="credential-dialog">
        <div className="credential-dialog__header">
          <h2 id={titleElementId} className="credential-dialog__title">
            {title}
          </h2>
        </div>
        <div className="credential-dialog__body">{children}</div>
        <div className="credential-dialog__footer">
          <button
            type="button"
            className="credential-dialog__btn credential-dialog__btn--secondary"
            data-testid={cancelTestId}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="button" className={confirmClass} data-testid={confirmTestId} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
