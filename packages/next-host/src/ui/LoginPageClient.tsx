"use client";

import { Component, type FormEvent, type ReactNode } from "react";
import { getProviders, signIn } from "next-auth/react";
import { OauthProviderIcon } from "./OauthProviderIcon";

type LoginPageClientProps = Readonly<{
  callbackUrl: string;
}>;

type LoginPageClientState = Readonly<{
  email: string;
  password: string;
  error: string | null;
  oauthProviders: ReadonlyArray<{ id: string; name: string }>;
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
      oauthProviders: [],
      isSubmitting: false,
      oauthSubmittingId: null,
    };
  }

  override async componentDidMount(): Promise<void> {
    const providers = await getProviders();
    const oauthProviders = Object.values(providers ?? {})
      .filter((p) => p.id !== "credentials")
      .map((p) => ({ id: p.id, name: p.name ?? p.id }));
    this.setState({ oauthProviders });
  }

  override render(): ReactNode {
    const { isSubmitting, oauthSubmittingId } = this.state;
    const formBusy = isSubmitting || oauthSubmittingId !== null;

    return (
      <div className="login-page" data-testid="login-page">
        <div className="login-page__backdrop" aria-hidden />
        <div className="login-page__noise" aria-hidden />
        <div className="login-page__card">
          <header className="login-page__brand">
            <span className="login-page__mark" aria-hidden>
              C
            </span>
            <div className="login-page__titles">
              <h1 className="login-page__title">Welcome back</h1>
              <p className="login-page__subtitle">Sign in to run and manage your workflows.</p>
            </div>
          </header>
          <form
            className="login-page__form"
            suppressHydrationWarning
            aria-busy={isSubmitting}
            onSubmit={(event: FormEvent) => {
              void this.submitCredentials(event);
            }}
          >
            <div className="login-page__field">
              <label className="login-page__label" htmlFor="codemation-login-email">
                Email
              </label>
              <input
                id="codemation-login-email"
                className="login-page__input"
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
            <div className="login-page__field">
              <label className="login-page__label" htmlFor="codemation-login-password">
                Password
              </label>
              <input
                id="codemation-login-password"
                className="login-page__input"
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
              <p className="login-page__error" data-testid="login-error" role="alert">
                {this.state.error}
              </p>
            ) : null}
            <button
              className="login-page__submit"
              type="submit"
              data-testid="login-submit"
              disabled={formBusy}
            >
              <span className="login-page__submit-inner">
                {isSubmitting ? <span className="login-page__spinner" aria-hidden data-testid="login-submit-spinner" /> : null}
                {isSubmitting ? "Signing in…" : "Sign in"}
              </span>
            </button>
          </form>
          {this.state.oauthProviders.length > 0 ? (
            <>
              <div className="login-page__divider">Or</div>
              <section className="login-page__oauth" aria-label="OAuth sign-in">
                <p className="login-page__oauth-label">Continue with a connected account</p>
                <div className="login-page__oauth-list">
                  {this.state.oauthProviders.map((provider) => {
                    const busy = oauthSubmittingId === provider.id;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        className="login-page__oauth-btn"
                        data-testid={`login-oauth-${provider.id}`}
                        disabled={formBusy}
                        onClick={() => this.handleOAuthSignIn(provider.id)}
                      >
                        <span className="login-page__oauth-btn-inner">
                          <OauthProviderIcon
                            providerId={provider.id}
                            className="login-page__oauth-icon"
                            testId={`login-oauth-${provider.id}-icon`}
                          />
                          {busy ? "Connecting…" : provider.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
          <footer className="login-page__footer">Codemation — workflow automation you own.</footer>
        </div>
      </div>
    );
  }

  private handleOAuthSignIn(providerId: string): void {
    this.setState({ oauthSubmittingId: providerId, error: null });
    void signIn(providerId, { callbackUrl: this.props.callbackUrl });
  }

  private async submitCredentials(event: FormEvent): Promise<void> {
    event.preventDefault();
    this.setState({ error: null, isSubmitting: true });
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: this.state.email,
        password: this.state.password,
        callbackUrl: this.props.callbackUrl,
      });
      if (result?.error) {
        this.setState({ error: "Invalid email or password.", isSubmitting: false });
        return;
      }
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      this.setState({ isSubmitting: false });
    } catch {
      this.setState({ error: "Something went wrong. Try again.", isSubmitting: false });
    }
  }
}
