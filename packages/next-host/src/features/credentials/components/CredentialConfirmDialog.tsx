"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CodemationDialog } from "@/components/CodemationDialog";

export type CredentialConfirmVariant = "danger" | "primary";

export type CredentialConfirmDialogProps = {
  title: string;
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
  testId,
  cancelTestId,
  confirmTestId,
  confirmLabel,
  confirmVariant,
  onCancel,
  onConfirm,
  children,
}: CredentialConfirmDialogProps) {
  return (
    <CodemationDialog
      onClose={onCancel}
      testId={testId}
      role="alertdialog"
      size="narrow"
      contentClassName="max-h-[min(70vh,480px)]"
    >
      <CodemationDialog.Title>{title}</CodemationDialog.Title>
      <CodemationDialog.Content>{children}</CodemationDialog.Content>
      <CodemationDialog.Actions>
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
      </CodemationDialog.Actions>
    </CodemationDialog>
  );
}
