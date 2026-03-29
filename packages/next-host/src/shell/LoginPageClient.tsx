"use client";

import { signIn } from "next-auth/react";
import { Component, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { OauthProviderIcon } from "../components/OauthProviderIcon";
import { CredentialsSignInRedirectResolver } from "./CredentialsSignInRedirectResolver";

type LoginPageClientProps = Readonly<{
  callbackUrl: string;
  productName: string;
  logoUrl: string | null;
  oauthProviders: ReadonlyArray<{ id: string; name: string }>;
}>;

type LoginPageClientState = Readonly<{
  email: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
  oauthSubmittingId: string | null;
}>;

export class LoginPageClient extends Component<LoginPageClientProps, LoginPageClientState> {
  constructor(props: LoginPageClientProps) {
    super(props);
    this.state = {
      email: "",
      password: "",
      error: null,
      isSubmitting: false,
      oauthSubmittingId: null,
    };
  }

  override render(): ReactNode {
    const { isSubmitting, oauthSubmittingId } = this.state;
    const formBusy = isSubmitting || oauthSubmittingId !== null;
    const { productName, logoUrl } = this.props;
    const titleInitial = productName.trim().length > 0 ? productName.trim().charAt(0).toUpperCase() : "C";

    return (
      <div
        className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-muted/40 to-background p-4"
        data-testid="login-page"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent"
          aria-hidden
        />
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
            <form
              className="flex flex-col gap-4"
              suppressHydrationWarning
              aria-busy={isSubmitting}
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void this.submitCredentials();
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
                  value={this.state.email}
                  onChange={(e) => this.setState({ email: e.target.value })}
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
                  value={this.state.password}
                  onChange={(e) => this.setState({ password: e.target.value })}
                  required
                  disabled={formBusy}
                  suppressHydrationWarning
                  data-testid="login-password"
                />
              </div>
              {this.state.error ? (
                <p className="text-sm text-destructive" data-testid="login-error" role="alert">
                  {this.state.error}
                </p>
              ) : null}
              <Button
                type="button"
                className="w-full"
                data-testid="login-submit"
                disabled={formBusy}
                onClick={() => {
                  void this.submitCredentials();
                }}
              >
                {isSubmitting ? (
                  <span
                    className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
                    aria-hidden
                    data-testid="login-submit-spinner"
                  />
                ) : null}
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            {this.props.oauthProviders.length > 0 ? (
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">Or</span>
                  <Separator className="flex-1" />
                </div>
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
                          onClick={() => this.handleOAuthSignIn(provider.id)}
                        >
                          <OauthProviderIcon
                            providerId={provider.id}
                            className="size-4 shrink-0"
                            testId={`login-oauth-${provider.id}-icon`}
                          />
                          {busy ? "Connecting…" : provider.name}
                        </Button>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="justify-center border-t bg-transparent pt-0">
            <p className="text-center text-xs text-muted-foreground" data-testid="login-whitelabel-tagline">
              {productName} — workflow automation you own.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  private handleOAuthSignIn(providerId: string): void {
    this.setState({ oauthSubmittingId: providerId, error: null });
    void signIn(providerId, { callbackUrl: this.props.callbackUrl });
  }

  private async submitCredentials(): Promise<void> {
    this.setState({ error: null, isSubmitting: true });
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: this.state.email,
        password: this.state.password,
        callbackUrl: this.props.callbackUrl,
      });
      if (!result) {
        this.setState({ error: "Something went wrong. Try again.", isSubmitting: false });
        return;
      }
      if (result.error) {
        this.setState({ error: "Invalid email or password.", isSubmitting: false });
        return;
      }
      const target = CredentialsSignInRedirectResolver.resolveRedirectUrl(result, this.props.callbackUrl);
      if (target) {
        window.location.assign(target);
        return;
      }
      this.setState({ isSubmitting: false });
    } catch {
      this.setState({ error: "Something went wrong. Try again.", isSubmitting: false });
    }
  }
}
