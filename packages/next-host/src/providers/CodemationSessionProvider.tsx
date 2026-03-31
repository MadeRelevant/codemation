"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { Component, createContext, type ReactNode } from "react";

type CodemationSessionRootProps = Readonly<{
  children: ReactNode;
  enabled: boolean;
  /**
   * Server-resolved session so the first client paint matches SSR (avoids `useSession` hydration mismatches).
   */
  session: Session | null;
}>;

export const CodemationSessionRootContext = createContext<Readonly<{ enabled: boolean }>>({
  enabled: false,
});

export class CodemationSessionRoot extends Component<CodemationSessionRootProps> {
  override render(): ReactNode {
    if (!this.props.enabled) {
      return (
        <CodemationSessionRootContext.Provider value={{ enabled: false }}>
          {this.props.children}
        </CodemationSessionRootContext.Provider>
      );
    }
    return (
      <CodemationSessionRootContext.Provider value={{ enabled: true }}>
        <SessionProvider session={this.props.session}>{this.props.children}</SessionProvider>
      </CodemationSessionRootContext.Provider>
    );
  }
}
