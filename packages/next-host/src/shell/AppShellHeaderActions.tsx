"use client";

import type { ReactNode } from "react";

import { AppShellHeaderActionsAuthenticated } from "./AppShellHeaderActionsAuthenticated";

export function AppShellHeaderActions(): ReactNode {
  if (process.env.NEXT_PUBLIC_CODEMATION_SKIP_UI_AUTH === "true") {
    return null;
  }
  return <AppShellHeaderActionsAuthenticated />;
}
