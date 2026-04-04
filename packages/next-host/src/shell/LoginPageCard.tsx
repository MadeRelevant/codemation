"use client";

import { Component, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { OauthProviderIcon } from "../components/OauthProviderIcon";

type LoginPageCardProps = Readonly<{
  authFailureMessage?: string;
  authStatus: "failed" | "resolved";
  credentialsEnabled: boolean;
  email: string;
  error: string | null;
  isSubmitting: boolean;
  logoUrl: string | null;
  oauthProviders: ReadonlyArray<{ id: string; name: string }>;
  oauthSubmittingId: string | null;
  password: string;
  productName: string;
  onEmailChange: (value: string) => void;
  onOAuthSignIn: (providerId: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}>;

export class LoginPageCard extends Component<LoginPageCardProps> {
  override render(): ReactNode {
    const { isSubmitting, oauthSubmittingId, authStatus, authFailureMessage, productName, logoUrl } = this.props;
    const formBusy = isSubmitting || oauthSubmittingId !== null;
    const titleInitial = productName.trim().length > 0 ? productName.trim().charAt(0).toUpperCase() : "C";
    const showCredentialsForm = authStatus === "resolved" && this.props.credentialsEnabled;
    const showOauthProviders = authStatus === "resolved" && this.props.oauthProviders.length > 0;
    const showUnavailableMessage = authStatus === "failed";
    const showNoProvidersMessage = authStatus === "resolved" && !showCredentialsForm && !showOauthProviders;

    return (
      <Card className="relative z-10 w-full max-w-md shadow-lg">
        <CardHeader className="gap-3">
          <div className="flex items-start gap-3">
            {logoUrl !== null ? (
              <img
                src={logoUrl}
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0 rounded-lg object-contain"
                data-testid="login-whitelabel-logo"
              />
            ) : (
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground"
                aria-hidden
                data-testid="login-whitelabel-initial"
              >
                {titleInitial}
              </span>
            )}
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <p className="text-base font-semibold text-foreground" data-testid="login-whitelabel-product-name">
                {productName}
              </p>
              <CardDescription>Sign in to run and manage your workflows.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showUnavailableMessage ? (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              data-testid="login-auth-unavailable"
              role="alert"
            >
              {authFailureMessage ?? "Sign-in options could not be loaded. Refresh the page or check the host logs."}
            </div>
          ) : null}
          {showCredentialsForm ? (
            <form
              className="flex flex-col gap-4"
              suppressHydrationWarning
              aria-busy={isSubmitting}
              data-testid="login-form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                this.props.onSubmit();
              }}
            >
              <div className="space-y-2" suppressHydrationWarning>
                <Label htmlFor="codemation-login-email">Email</Label>
                <Input
                  id="codemation-login-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={this.props.email}
                  onChange={(e) => this.props.onEmailChange(e.target.value)}
                  required
                  disabled={formBusy}
                  suppressHydrationWarning
                  data-testid="login-email"
                />
              </div>
              <div className="space-y-2" suppressHydrationWarning>
                <Label htmlFor="codemation-login-password">Password</Label>
                <Input
                  id="codemation-login-password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={this.props.password}
                  onChange={(e) => this.props.onPasswordChange(e.target.value)}
                  required
                  disabled={formBusy}
                  suppressHydrationWarning
                  data-testid="login-password"
                />
              </div>
              {this.props.error ? (
                <p className="text-sm text-destructive" data-testid="login-error" role="alert">
                  {this.props.error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" data-testid="login-submit" disabled={formBusy}>
                {isSubmitting ? (
                  <span
                    className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
                    aria-hidden
                    data-testid="login-submit-spinner"
                  />
                ) : null}
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          ) : null}
          {showOauthProviders ? (
            <div className="mt-6 space-y-4">
              {showCredentialsForm ? (
                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">Or</span>
                  <Separator className="flex-1" />
                </div>
              ) : null}
              <section className="space-y-3" aria-label="OAuth sign-in">
                <p className="text-center text-xs text-muted-foreground">Continue with a connected account</p>
                <div className="flex flex-col gap-2">
                  {this.props.oauthProviders.map((provider) => {
                    const busy = oauthSubmittingId === provider.id;
                    return (
                      <Button
                        key={provider.id}
                        type="button"
                        variant="outline"
                        className="w-full justify-center gap-2"
                        data-testid={`login-oauth-${provider.id}`}
                        disabled={formBusy}
                        onClick={() => this.props.onOAuthSignIn(provider.id)}
                      >
                        <OauthProviderIcon
                          providerId={provider.id}
                          className="size-4 shrink-0"
                          testId={`login-oauth-${provider.id}-icon`}
                        />
                        {busy ? "Connecting..." : provider.name}
                      </Button>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}
          {showNoProvidersMessage ? (
            <p className="text-sm text-muted-foreground" data-testid="login-no-auth-methods">
              No sign-in methods are configured for this environment yet.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-center border-t bg-transparent pt-0">
          <p className="text-center text-xs text-muted-foreground" data-testid="login-whitelabel-tagline">
            {productName} - workflow automation you own.
          </p>
        </CardFooter>
      </Card>
    );
  }
}
