"use client";

import type { VerifyUserInviteResponseDto } from "@codemation/frontend-src/application/contracts/UserDirectoryContracts";
import { ApiPaths } from "@codemation/frontend-src/presentation/http/ApiPaths";
import { useEffect,useState,type FormEvent } from "react";
import { PasswordStrengthMeter } from "../components/PasswordStrengthMeter";

export type InviteAcceptScreenProps = Readonly<{
  inviteToken: string;
  /** Where to send the user after activation (Next.js app login). */
  loginHref?: string;
}>;

export function InviteAcceptScreen(props: InviteAcceptScreenProps) {
  const loginHref = props.loginHref ?? "/login";
  const [verifyState, setVerifyState] = useState<"pending" | "invalid" | "valid">("pending");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      const url = `${ApiPaths.userInviteVerify()}?token=${encodeURIComponent(props.inviteToken)}`;
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setVerifyState("invalid");
          return;
        }
        const data = (await response.json()) as VerifyUserInviteResponseDto;
        if (cancelled) return;
        if (data.valid && data.email) {
          setVerifyState("valid");
          setEmail(data.email);
        } else {
          setVerifyState("invalid");
        }
      } catch {
        if (!cancelled) setVerifyState("invalid");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.inviteToken]);

  const submit = async (): Promise<void> => {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await fetch(ApiPaths.userInviteAccept(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: props.inviteToken, password }),
      });
      if (!response.ok) {
        setError(await response.text());
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  if (verifyState === "pending") {
    return (
      <div className="invite-accept-screen" data-testid="invite-accept-loading">
        <p data-testid="invite-accept-loading-message">Checking your invite…</p>
      </div>
    );
  }

  if (verifyState === "invalid") {
    return (
      <div className="invite-accept-screen" data-testid="invite-accept-invalid">
        <h1 className="invite-accept-screen__title" data-testid="invite-accept-invalid-title">
          Invite invalid or expired
        </h1>
        <p className="invite-accept-screen__help" data-testid="invite-accept-invalid-message">
          Ask your administrator to send a new invite.
        </p>
        <a className="invite-accept-screen__secondary-link" href={loginHref} data-testid="invite-accept-back-to-login">
          Log in
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="invite-accept-screen" data-testid="invite-accept-done">
        <h1 className="invite-accept-screen__title" data-testid="invite-accept-done-title">
          You&apos;re all set
        </h1>
        <p className="invite-accept-screen__help" data-testid="invite-accept-done-message">
          Your account is active. Sign in with your email and new password.
        </p>
        <a className="invite-accept-screen__submit" href={loginHref} data-testid="invite-accept-login">
          Log in
        </a>
      </div>
    );
  }

  return (
    <div className="invite-accept-screen" data-testid="invite-accept-form">
      <h1 className="invite-accept-screen__title" data-testid="invite-accept-form-title">
        Set your password
      </h1>
      <p className="invite-accept-screen__help" data-testid="invite-accept-email">
        {email}
      </p>
      <form data-testid="invite-accept-password-form" onSubmit={onFormSubmit}>
        <label className="invite-accept-screen__field">
          <span className="invite-accept-screen__label">Password</span>
          <input
            type="password"
            className="invite-accept-screen__input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            data-testid="invite-accept-password"
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} dataTestId="invite-accept-password-strength" />
        </label>
        <label className="invite-accept-screen__field">
          <span className="invite-accept-screen__label">Confirm password</span>
          <input
            type="password"
            className="invite-accept-screen__input"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError(null);
            }}
            data-testid="invite-accept-confirm-password"
            autoComplete="new-password"
          />
        </label>
        {error && (
          <div className="invite-accept-screen__error" data-testid="invite-accept-error" role="alert">
            {error}
          </div>
        )}
        <button
          type="submit"
          className="invite-accept-screen__submit"
          data-testid="invite-accept-submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving…" : "Activate account"}
        </button>
      </form>
    </div>
  );
}
