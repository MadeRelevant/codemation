"use client";

export type CredentialsScreenTestFailureAlertProps = {
  message?: string;
  onDismiss: () => void;
};

export function CredentialsScreenTestFailureAlert({ message, onDismiss }: CredentialsScreenTestFailureAlertProps) {
  return (
    <div className="credentials-test-failure-alert" role="alert" data-testid="credential-test-failure-alert">
      <div className="credentials-test-failure-alert__content">
        <strong className="credentials-test-failure-alert__title">Credential test failed</strong>
        <p className="credentials-test-failure-alert__message">{message || "Test failed"}</p>
      </div>
      <button
        type="button"
        className="credentials-test-failure-alert__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
        data-testid="credential-test-failure-alert-dismiss"
      >
        ×
      </button>
    </div>
  );
}
