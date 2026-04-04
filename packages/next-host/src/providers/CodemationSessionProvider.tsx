"use client";

import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { Component, createContext, type ReactNode } from "react";

export type CodemationSession = Readonly<{
  id: string;
  email: string | null;
  name: string | null;
}>;

export type CodemationSessionContextValue = Readonly<{
  enabled: boolean;
  session: CodemationSession | null;
  status: "anonymous" | "authenticated" | "loading";
}>;

type CodemationSessionRootProps = Readonly<{
  children: ReactNode;
  enabled: boolean;
}>;

export const CodemationSessionRootContext = createContext<CodemationSessionContextValue>({
  enabled: false,
  session: null,
  status: "anonymous",
});

type CodemationSessionRootState = Readonly<{
  session: CodemationSession | null;
  status: "anonymous" | "authenticated" | "loading";
}>;

export class CodemationSessionRoot extends Component<CodemationSessionRootProps> {
  state: CodemationSessionRootState = this.props.enabled
    ? {
        session: null,
        status: "loading",
      }
    : {
        session: null,
        status: "anonymous",
      };

  override componentDidMount(): void {
    if (this.props.enabled) {
      void this.refreshSession();
    }
  }

  override componentDidUpdate(previousProps: CodemationSessionRootProps): void {
    if (!previousProps.enabled && this.props.enabled) {
      this.setState({ session: null, status: "loading" });
      void this.refreshSession();
      return;
    }
    if (previousProps.enabled && !this.props.enabled) {
      this.setState({ session: null, status: "anonymous" });
    }
  }

  override render(): ReactNode {
    return (
      <CodemationSessionRootContext.Provider
        value={{
          enabled: this.props.enabled,
          session: this.state.session,
          status: this.state.status,
        }}
      >
        {this.props.children}
      </CodemationSessionRootContext.Provider>
    );
  }

  private async refreshSession(): Promise<void> {
    try {
      const response = await fetch(ApiPaths.authSession(), {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        this.setState({ session: null, status: "anonymous" });
        return;
      }
      const session = (await response.json()) as CodemationSession | null;
      this.setState({
        session,
        status: session ? "authenticated" : "anonymous",
      });
    } catch {
      this.setState({ session: null, status: "anonymous" });
    }
  }
}
