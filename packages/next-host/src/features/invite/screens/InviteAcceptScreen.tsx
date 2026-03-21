"use client";

import type { VerifyUserInviteResponseDto } from "@codemation/host-src/application/contracts/userDirectoryContracts.types";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { codemationApiClient } from "../../../api/CodemationApiClient";
import { CodemationApiHttpError } from "../../../api/CodemationApiHttpError";
import { PasswordStrengthMeter } from "../../../components/PasswordStrengthMeter";

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
        const data = await codemationApiClient.getJson<VerifyUserInviteResponseDto>(url);
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
      await codemationApiClient.postJson(ApiPaths.userInviteAccept(), { token: props.inviteToken, password });
      setDone(true);
    } catch (e) {
      if (e instanceof CodemationApiHttpError) {
        setError(e.bodyText.trim() || e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const shell = (children: ReactNode) => (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">{children}</div>
  );

  if (verifyState === "pending") {
    return shell(
      <Card className="w-full max-w-md" data-testid="invite-accept-loading">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground" data-testid="invite-accept-loading-message">
            Checking your invite…
          </p>
        </CardContent>
      </Card>,
    );
  }

  if (verifyState === "invalid") {
    return shell(
      <Card className="w-full max-w-md" data-testid="invite-accept-invalid">
        <CardHeader>
          <CardTitle data-testid="invite-accept-invalid-title">Invite invalid or expired</CardTitle>
          <CardDescription data-testid="invite-accept-invalid-message">
            Ask your administrator to send a new invite.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" asChild>
            <a href={loginHref} data-testid="invite-accept-back-to-login">
              Log in
            </a>
          </Button>
        </CardFooter>
      </Card>,
    );
  }

  if (done) {
    return shell(
      <Card className="w-full max-w-md" data-testid="invite-accept-done">
        <CardHeader>
          <CardTitle data-testid="invite-accept-done-title">You&apos;re all set</CardTitle>
          <CardDescription data-testid="invite-accept-done-message">
            Your account is active. Sign in with your email and new password.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <a href={loginHref} data-testid="invite-accept-login">
              Log in
            </a>
          </Button>
        </CardFooter>
      </Card>,
    );
  }

  return shell(
    <Card className="w-full max-w-lg" data-testid="invite-accept-form">
      <CardHeader>
        <CardTitle data-testid="invite-accept-form-title">Set your password</CardTitle>
        <CardDescription data-testid="invite-accept-email">{email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" data-testid="invite-accept-password-form" onSubmit={onFormSubmit}>
          <div className="space-y-2">
            <Label htmlFor="invite-password">Password</Label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              data-testid="invite-accept-password"
              autoComplete="new-password"
            />
            <PasswordStrengthMeter password={password} dataTestId="invite-accept-password-strength" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-confirm">Confirm password</Label>
            <Input
              id="invite-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              data-testid="invite-accept-confirm-password"
              autoComplete="new-password"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" data-testid="invite-accept-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" data-testid="invite-accept-submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Activate account"}
          </Button>
        </form>
      </CardContent>
    </Card>,
  );
}
