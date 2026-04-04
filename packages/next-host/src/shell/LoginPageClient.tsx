"use client";

import { InAppCallbackUrlPolicy } from "@codemation/host-src/infrastructure/auth/InAppCallbackUrlPolicy";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { Component, type ReactNode } from "react";

import { CodemationBrowserCsrfCoordinator } from "./CodemationBrowserCsrfCoordinator";
import { LoginPageCard } from "./LoginPageCard";

type LoginPageClientProps = Readonly<{
  authStatus: "failed" | "resolved";
  callbackUrl: string;
  credentialsEnabled: boolean;
  authFailureMessage?: string;
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
  private readonly callbackUrlPolicy = new InAppCallbackUrlPolicy();

  private readonly csrfCoordinator = new CodemationBrowserCsrfCoordinator(ApiPaths.authSession());

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
    return (
      <div
        className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-muted/40 to-background p-4"
        data-testid="login-page"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent"
          aria-hidden
        />
        <LoginPageCard
          authFailureMessage={this.props.authFailureMessage}
          authStatus={this.props.authStatus}
          credentialsEnabled={this.props.credentialsEnabled}
          email={this.state.email}
          error={this.state.error}
          isSubmitting={this.state.isSubmitting}
          logoUrl={this.props.logoUrl}
          oauthProviders={this.props.oauthProviders}
          oauthSubmittingId={this.state.oauthSubmittingId}
          password={this.state.password}
          productName={this.props.productName}
          onEmailChange={(value) => this.setState({ email: value })}
          onOAuthSignIn={(providerId) => this.handleOAuthSignIn(providerId)}
          onPasswordChange={(value) => this.setState({ password: value })}
          onSubmit={() => {
            void this.submitCredentials();
          }}
        />
      </div>
    );
  }

  private handleOAuthSignIn(providerId: string): void {
    this.setState({ oauthSubmittingId: providerId, error: null });
    const safeCallbackUrl = this.callbackUrlPolicy.resolveSafeRelativeCallbackUrl(this.props.callbackUrl);
    window.location.assign(ApiPaths.authOAuthStart(providerId, safeCallbackUrl));
  }

  private async submitCredentials(): Promise<void> {
    this.setState({ error: null, isSubmitting: true });
    try {
      const csrfToken = await this.csrfCoordinator.ensureToken(globalThis.fetch);
      if (!csrfToken) {
        this.setState({ error: "Something went wrong. Try again.", isSubmitting: false });
        return;
      }
      const response = await fetch(ApiPaths.authLogin(), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-codemation-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          email: this.state.email,
          password: this.state.password,
        }),
      });
      if (response.status === 204) {
        const safeCallbackUrl = this.callbackUrlPolicy.resolveSafeRelativeCallbackUrl(this.props.callbackUrl);
        window.location.assign(safeCallbackUrl);
        return;
      }
      if (response.status === 401) {
        this.setState({ error: "Invalid email or password.", isSubmitting: false });
        return;
      }
      let errorMessage = "Something went wrong. Try again.";
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) {
          errorMessage = payload.error;
        }
      } catch {
        // Leave the generic message when the backend returned no JSON payload.
      }
      this.setState({ error: errorMessage, isSubmitting: false });
    } catch {
      this.setState({ error: "Something went wrong. Try again.", isSubmitting: false });
    }
  }
}
