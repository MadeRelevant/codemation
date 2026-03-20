"use client";

import "@xyflow/react/dist/style.css";
import "rc-tree/assets/index.css";

import { Component,type ReactNode } from "react";
import { Providers } from "./providers/Providers";

export interface CodemationNextClientShellProps {
  readonly children: ReactNode;
}

export class CodemationNextClientShell extends Component<CodemationNextClientShellProps> {
  render(): ReactNode {
    return <Providers websocketPort={process.env.NEXT_PUBLIC_CODEMATION_WS_PORT}>{this.props.children}</Providers>;
  }
}
