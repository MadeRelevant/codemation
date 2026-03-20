"use client";

import { InviteAcceptScreen } from "@codemation/frontend/next/client";
import { Component, type ReactNode } from "react";

export interface HostedInviteAcceptPageProps {
  readonly inviteToken: string;
}

export class HostedInviteAcceptPage extends Component<HostedInviteAcceptPageProps> {
  render(): ReactNode {
    return <InviteAcceptScreen inviteToken={this.props.inviteToken} loginHref="/login" />;
  }
}
