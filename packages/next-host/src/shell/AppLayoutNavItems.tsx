"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

import { IconCredentials, IconDashboard, IconUsers, IconWorkflow } from "./appLayoutSidebarIcons";
import { useWorkflowsQuery } from "../features/workflows/hooks/realtime/realtime";

export interface AppLayoutNavItemsProps {
  readonly collapsed: boolean;
}

export function AppLayoutNavItems({ collapsed }: AppLayoutNavItemsProps): ReactNode {
  const pathname = usePathname();
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data ?? [];

  const navItem = (href: string, label: string, icon: ReactNode, exact?: boolean) => {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    const content = (
      <Link
        href={href}
        className={`app-sidebar__item ${isActive ? "app-sidebar__item--active" : ""}`}
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="app-sidebar__item-icon" aria-hidden>
          {icon}
        </span>
        {!collapsed && <span className="app-sidebar__item-label">{label}</span>}
      </Link>
    );
    return collapsed ? (
      <span className="app-sidebar__tooltip-wrap" data-tooltip={label}>
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
        <div className="app-sidebar__workflows app-sidebar__workflows--icons-only">
          <span className="app-sidebar__tooltip-wrap" data-tooltip="All workflows">
            <Link
              href="/workflows"
              className={`app-sidebar__workflow app-sidebar__workflow--icon-only ${pathname === "/workflows" ? "app-sidebar__item--active" : ""}`}
              data-testid="nav-workflows"
            >
              <span className="app-sidebar__workflow-icon">
                <IconWorkflow />
              </span>
            </Link>
          </span>
          {workflowsQuery.isLoading && <span className="app-sidebar__workflow-placeholder">…</span>}
          {!workflowsQuery.isLoading &&
            workflows.map((w) => {
              const href = `/workflows/${encodeURIComponent(w.id)}`;
              const isActive = pathname === href;
              return (
                <span key={w.id} className="app-sidebar__tooltip-wrap" data-tooltip={w.name}>
                  <Link
                    href={href}
                    className={`app-sidebar__workflow app-sidebar__workflow--icon-only ${isActive ? "app-sidebar__item--active" : ""}`}
                    data-testid={`nav-workflow-${w.id}`}
                  >
                    <span className="app-sidebar__workflow-icon">
                      <IconWorkflow />
                    </span>
                  </Link>
                </span>
              );
            })}
        </div>
      ) : (
        <div className="app-sidebar__section">
          <span className="app-sidebar__section-label">Workflows</span>
          <div className="app-sidebar__workflows">
            <Link
              href="/workflows"
              className={`app-sidebar__workflow ${pathname === "/workflows" ? "app-sidebar__item--active" : ""}`}
              data-testid="nav-workflows"
            >
              <span className="app-sidebar__workflow-icon">
                <IconWorkflow />
              </span>
              <span className="app-sidebar__workflow-label">All workflows</span>
            </Link>
            {workflowsQuery.isLoading && <span className="app-sidebar__workflow-placeholder">Loading…</span>}
            {!workflowsQuery.isLoading && workflows.length === 0 && (
              <span className="app-sidebar__workflow-placeholder">No workflows</span>
            )}
            {workflows.map((w) => {
              const href = `/workflows/${encodeURIComponent(w.id)}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={w.id}
                  href={href}
                  className={`app-sidebar__workflow ${isActive ? "app-sidebar__item--active" : ""}`}
                  data-testid={`nav-workflow-${w.id}`}
                >
                  <span className="app-sidebar__workflow-icon">
                    <IconWorkflow />
                  </span>
                  <span className="app-sidebar__workflow-label">{w.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
