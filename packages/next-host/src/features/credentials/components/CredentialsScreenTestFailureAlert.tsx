"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type CredentialsScreenTestFailureAlertProps = {
  message?: string;
  onDismiss: () => void;
};

export function CredentialsScreenTestFailureAlert({ message, onDismiss }: CredentialsScreenTestFailureAlertProps) {
  return (
    <Alert
      variant="destructive"
      role="alert"
      data-testid="credential-test-failure-alert"
      className="mb-6 items-start"
    >
      <div className="min-w-0 flex-1">
        <AlertTitle>Credential test failed</AlertTitle>
        <AlertDescription className="text-destructive/90">{message || "Test failed"}</AlertDescription>
      </div>
      <AlertAction>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDismiss}
          aria-label="Dismiss"
          data-testid="credential-test-failure-alert-dismiss"
        >
          ×
        </Button>
      </AlertAction>
    </Alert>
  );
}
