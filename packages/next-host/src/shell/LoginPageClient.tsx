"use client";

import { InAppCallbackUrlPolicy } from "@codemation/host-src/infrastructure/auth/InAppCallbackUrlPolicy";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { Component, type ReactNode } from "react";

import { CodemationBetterAuthBrowserClientFactory } from "../auth/CodemationBetterAuthBrowserClientFactory";
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
  isInteractive: boolean;
  isSubmitting: boolean;
  oauthSubmittingId: string | null;
}>;

export class LoginPageClient extends Component<LoginPageClientProps, LoginPageClientState> {
  private readonly callbackUrlPolicy = new InAppCallbackUrlPolicy();

  private readonly authClient = new CodemationBetterAuthBrowserClientFactory().create();

  constructor(props: LoginPageClientProps) {
    super(props);
    this.state = {
      email: "",
      password: "",
      error: null,
      isInteractive: false,
      isSubmitting: false,
      oauthSubmittingId: null,
    };
  }

  override componentDidMount(): void {
    this.setState({ isInteractive: true });
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
          isInteractive={this.state.isInteractive}
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
      const safeCallbackUrl = this.callbackUrlPolicy.resolveSafeRelativeCallbackUrl(this.props.callbackUrl);
      const callbackUrl = new URL(safeCallbackUrl, window.location.origin).toString();
      const result = await this.authClient.signIn.email({
        email: this.state.email,
        password: this.state.password,
        callbackURL: callbackUrl,
      });
      const signInError = this.readBetterFetchError(result);
      if (signInError) {
        if (signInError.status === 401) {
          this.setState({ error: "Invalid email or password.", isSubmitting: false });
          return;
        }
        this.setState({
          error: signInError.message ?? "Something went wrong. Try again.",
          isSubmitting: false,
        });
        return;
      }
      window.location.assign(safeCallbackUrl);
    } catch {
      this.setState({ error: "Something went wrong. Try again.", isSubmitting: false });
    }
  }

  private readBetterFetchError(result: unknown): { status: number; message?: string } | null {
    if (result === null || result === undefined || typeof result !== "object") {
      return null;
    }
    const record = result as Record<string, unknown>;
    const error = record.error;
    if (error === null || error === undefined) {
      return null;
    }
    if (typeof error !== "object") {
      return { status: 500 };
    }
    const errorRecord = error as Record<string, unknown>;
    const status = typeof errorRecord.status === "number" ? errorRecord.status : 500;
    const message = typeof errorRecord.message === "string" ? errorRecord.message : undefined;
    return { status, message };
  }
}
