"use client";

import { Component,type ReactNode } from "react";
import { InviteAcceptScreen } from "./screens/InviteAcceptScreen";

export interface HostedInviteAcceptPageProps {
  readonly inviteToken: string;
}

export class HostedInviteAcceptPage extends Component<HostedInviteAcceptPageProps> {
  render(): ReactNode {
    return <InviteAcceptScreen inviteToken={this.props.inviteToken} loginHref="/login" />;
  }
}
