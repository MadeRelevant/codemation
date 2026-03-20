"use client";

export type CredentialDialogFeedbackProps = {
  errorMessage: string | null;
  dialogTestResult: { status: string; message?: string } | null;
};

export function CredentialDialogFeedback({ errorMessage, dialogTestResult }: CredentialDialogFeedbackProps) {
  return (
    <>
      {errorMessage && (
        <div className="credential-dialog__error" data-testid="credentials-error">
          {errorMessage}
        </div>
      )}
      {dialogTestResult && (
        <div
          className={`credentials-table__test-result credentials-table__test-result--${dialogTestResult.status}`}
          data-testid="credential-dialog-test-result"
        >
          {dialogTestResult.status === "healthy" ? "Healthy" : "Failing"}
          {dialogTestResult.message ? `: ${dialogTestResult.message}` : ""}
        </div>
      )}
    </>
  );
}
