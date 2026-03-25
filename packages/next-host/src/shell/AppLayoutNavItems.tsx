"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { IconCredentials, IconDashboard, IconUsers, IconWorkflow } from "./appLayoutSidebarIcons";
import { WorkflowSidebarNavTree } from "./WorkflowSidebarNavTree";
import { useWorkflowsQuery } from "../features/workflows/hooks/realtime/realtime";

export interface AppLayoutNavItemsProps {
  readonly collapsed: boolean;
}

const navLinkClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-3 rounded-sm px-4 py-3 text-sm no-underline transition-colors",
    "text-sidebar-foreground hover:bg-sidebar-accent/80",
    isActive && "bg-sidebar-accent font-medium text-sidebar-primary",
  );

const workflowLinkClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-3 rounded-sm px-4 py-2 text-sm no-underline transition-colors",
    "text-sidebar-foreground hover:bg-sidebar-accent/80",
    isActive && "bg-sidebar-accent font-medium text-sidebar-primary",
  );

const workflowLinkClassCollapsed = (isActive: boolean) =>
  cn(
    "flex items-center justify-center rounded-sm p-3 text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent/80",
    isActive && "bg-sidebar-accent font-medium text-sidebar-primary",
  );

export function AppLayoutNavItems({ collapsed }: AppLayoutNavItemsProps): ReactNode {
  const pathname = usePathname();
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data ?? [];

  const navItem = (href: string, label: string, icon: ReactNode, exact?: boolean) => {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    const content = (
      <Link
        key={href}
        href={href}
        className={navLinkClass(isActive)}
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        title={collapsed ? label : undefined}
      >
        <span className="flex shrink-0 items-center justify-center" aria-hidden>
          {icon}
        </span>
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
    return collapsed ? (
      <span key={href} className="relative flex overflow-visible" title={label}>
        {content}
      </span>
    ) : (
      content
    );
  };

  return (
    <>
      {navItem("/dashboard", "Dashboard", <IconDashboard />, true)}
      {navItem("/credentials", "Credentials", <IconCredentials />)}
      {navItem("/users", "Users", <IconUsers />)}
      {collapsed ? (
        <div className="mt-3 flex flex-col gap-1">
          <span className="relative flex overflow-visible" title="All workflows">
            <Link
              href="/workflows"
              className={cn(
                "flex items-center justify-center rounded-sm p-3 text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent/80",
                pathname === "/workflows" && "bg-sidebar-accent font-medium text-sidebar-primary",
              )}
              data-testid="nav-workflows"
            >
              <span className="flex shrink-0 opacity-70" aria-hidden>
                <IconWorkflow />
              </span>
            </Link>
          </span>
          {workflowsQuery.isLoading && <span className="px-4 py-2 text-xs text-muted-foreground">…</span>}
          {!workflowsQuery.isLoading && workflows.length > 0 && (
            <WorkflowSidebarNavTree
              workflows={workflows}
              pathname={pathname}
              workflowLinkClass={workflowLinkClassCollapsed}
              collapsed
            />
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          <span className="px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Workflows
          </span>
          <div className="flex flex-col gap-1">
            <Link
              href="/workflows"
              className={workflowLinkClass(pathname === "/workflows")}
              data-testid="nav-workflows"
            >
              <span className="flex shrink-0 opacity-70" aria-hidden>
                <IconWorkflow />
              </span>
              <span className="truncate text-sm">All workflows</span>
            </Link>
            {workflowsQuery.isLoading && <span className="px-4 py-2 text-xs text-muted-foreground">Loading…</span>}
            {!workflowsQuery.isLoading && workflows.length === 0 && (
              <span className="px-4 py-2 text-xs text-muted-foreground">No workflows</span>
            )}
            {!workflowsQuery.isLoading && workflows.length > 0 && (
              <WorkflowSidebarNavTree workflows={workflows} pathname={pathname} workflowLinkClass={workflowLinkClass} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
