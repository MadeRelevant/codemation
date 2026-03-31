"use client";

import { useContext, type ReactNode } from "react";

import { CodemationSessionRootContext } from "../providers/CodemationSessionProvider";
import { AppShellHeaderActionsAuthenticated } from "./AppShellHeaderActionsAuthenticated";

export function AppShellHeaderActions(): ReactNode {
  const sessionRoot = useContext(CodemationSessionRootContext);
  if (!sessionRoot.enabled) {
    return null;
  }
  return <AppShellHeaderActionsAuthenticated />;
}
