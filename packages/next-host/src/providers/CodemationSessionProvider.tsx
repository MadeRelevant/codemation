"use client";

import { Component, createContext, type ReactNode } from "react";

import { CodemationBetterAuthBrowserClientFactory } from "../auth/CodemationBetterAuthBrowserClientFactory";
import { CodemationBetterAuthPrincipalMapper } from "../auth/CodemationBetterAuthPrincipalMapper";

import type { CodemationSession, CodemationSessionContextValue } from "./CodemationSession.types";

export type { CodemationSession, CodemationSessionContextValue };

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
  private readonly authClient = new CodemationBetterAuthBrowserClientFactory().create();

  private readonly principalMapper = new CodemationBetterAuthPrincipalMapper();

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
      const result = await this.authClient.getSession();
      const payload = this.unwrapBetterFetchResult(result);
      if (payload === undefined) {
        this.setState({ session: null, status: "anonymous" });
        return;
      }
      const session = this.principalMapper.fromGetSessionPayload(payload);
      this.setState({
        session,
        status: session ? "authenticated" : "anonymous",
      });
    } catch {
      this.setState({ session: null, status: "anonymous" });
    }
  }

  private unwrapBetterFetchResult(result: unknown): unknown {
    if (result === null || result === undefined || typeof result !== "object") {
      return undefined;
    }
    const record = result as Record<string, unknown>;
    if ("error" in record && record.error !== null && record.error !== undefined) {
      return undefined;
    }
    if ("data" in record) {
      return record.data;
    }
    return result;
  }
}
