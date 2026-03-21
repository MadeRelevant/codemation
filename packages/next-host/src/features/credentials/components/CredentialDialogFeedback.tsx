"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CredentialDialogFeedbackProps = {
  errorMessage: string | null;
  dialogTestResult: { status: string; message?: string } | null;
};

export function CredentialDialogFeedback({ errorMessage, dialogTestResult }: CredentialDialogFeedbackProps) {
  return (
    <>
      {errorMessage && (
        <Alert variant="destructive" data-testid="credentials-error">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {dialogTestResult && (
        <Badge
          variant={dialogTestResult.status === "healthy" ? "secondary" : "destructive"}
          data-testid="credential-dialog-test-result"
          className={cn(
            "h-auto min-h-8 whitespace-normal px-2.5 py-1.5 text-left font-normal",
            dialogTestResult.status === "healthy" &&
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
          )}
        >
          {dialogTestResult.status === "healthy" ? "Healthy" : "Failing"}
          {dialogTestResult.message ? `: ${dialogTestResult.message}` : ""}
        </Badge>
      )}
    </>
  );
}
