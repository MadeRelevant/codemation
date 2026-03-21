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
    <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b border-border bg-card px-8">
      <div className="min-w-0 flex-1">
        <h1 className="m-0 truncate text-xl font-semibold leading-none text-foreground">{title}</h1>
      </div>
      <AppShellHeaderActions />
    </header>
  );
}
