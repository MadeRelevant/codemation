"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

import { getPageTitle } from "./appLayoutPageTitle";
import { AppShellHeaderActions } from "./AppShellHeaderActions";
import { useWorkflowsQuery } from "../features/workflows/hooks/realtime/realtime";

export function AppLayoutPageHeader(): ReactNode {
  const pathname = usePathname();
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data ?? [];
  const title = getPageTitle(pathname, workflows);
  return (
    <header className="app-main__header">
      <div className="app-main__header-lead">
        <h1 className="app-main__title">{title}</h1>
      </div>
      <AppShellHeaderActions />
    </header>
  );
}
