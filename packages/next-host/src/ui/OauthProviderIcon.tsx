"use client";

import { Component, type ReactNode } from "react";

import { GoogleColorGIcon } from "./GoogleColorGIcon";
import { simpleIconForProvider } from "./oauthProviderIconData";

export type OauthProviderIconProps = Readonly<{
  providerId: string;
  className?: string;
  testId?: string;
}>;

export class OauthProviderIcon extends Component<OauthProviderIconProps> {
  override render(): ReactNode {
    if (this.props.providerId === "google") {
      return <GoogleColorGIcon className={this.props.className} testId={this.props.testId} />;
    }
    const icon = simpleIconForProvider(this.props.providerId);
    return (
      <svg
        role="img"
        className={this.props.className}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        data-testid={this.props.testId}
      >
        <path d={icon.path} fill={`#${icon.hex}`} />
      </svg>
    );
  }
}
