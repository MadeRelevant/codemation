"use client";

import { Component,type ReactNode } from "react";
import { UsersScreen } from "./screens/UsersScreen";

export class HostedUsersPage extends Component {
  render(): ReactNode {
    return <UsersScreen />;
  }
}
