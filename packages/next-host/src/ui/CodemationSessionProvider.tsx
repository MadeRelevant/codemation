"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { Component, type ReactNode } from "react";

type CodemationSessionRootProps = Readonly<{
  children: ReactNode;
  /**
   * Server-resolved session so the first client paint matches SSR (avoids `useSession` hydration mismatches).
   */
  session: Session | null;
}>;

export class CodemationSessionRoot extends Component<CodemationSessionRootProps> {
  override render(): ReactNode {
    return <SessionProvider session={this.props.session}>{this.props.children}</SessionProvider>;
  }
}
