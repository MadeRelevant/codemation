"use client";

import { signOut,useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Component,type ReactNode,useState } from "react";
import { useWorkflowsQuery } from "./realtime/realtime";

const SIDEBAR_WIDTH_KEY = "codemation-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "codemation-sidebar-collapsed";
const MIN_SIDEBAR_WIDTH = 12;
const MAX_SIDEBAR_WIDTH = 28;
const DEFAULT_SIDEBAR_WIDTH = 16;

const IconDashboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </svg>
);
const IconCredentials = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.85 12.15L19 4" />
    <path d="m18 5 2 2" />
    <path d="m15 8 2 2" />
  </svg>
);
const IconChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const IconWorkflow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect width="8" height="8" x="3" y="3" rx="1" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <path d="M15 7h4a2 2 0 0 1 2 2v4" />
    <path d="M3 11h4" />
    <path d="M11 3h4" />
  </svg>
);
const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export interface AppLayoutProps {
  readonly children: ReactNode;
}

type AppLayoutState = {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  isResizing: boolean;
};

function loadSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const n = stored ? Number.parseFloat(stored) : DEFAULT_SIDEBAR_WIDTH;
  return Number.isFinite(n) ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, n)) : DEFAULT_SIDEBAR_WIDTH;
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

export class AppLayout extends Component<AppLayoutProps, AppLayoutState> {
  override state: AppLayoutState = {
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    sidebarCollapsed: false,
    isResizing: false,
  };

  override componentDidMount(): void {
    this.setState({
      sidebarWidth: loadSidebarWidth(),
      sidebarCollapsed: loadSidebarCollapsed(),
    });
  }

  private handleResizeStart = (e: React.MouseEvent): void => {
    e.preventDefault();
    this.setState({ isResizing: true });
    const onMove = (moveEvent: MouseEvent): void => {
      const rem = moveEvent.clientX / 16;
      const w = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, rem));
      this.setState({ sidebarWidth: w });
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
    };
    const onUp = (): void => {
      this.setState({ isResizing: false });
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  private handleToggleCollapse = (): void => {
    this.setState((s) => {
      const next = !s.sidebarCollapsed;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return { sidebarCollapsed: next };
    });
  };

  override render(): ReactNode {
    const { children } = this.props;
    const { sidebarWidth, sidebarCollapsed, isResizing } = this.state;
    const widthRem = sidebarCollapsed ? 3.5 : sidebarWidth;
    return (
      <div className={`app-layout ${isResizing ? "app-layout--resizing" : ""}`}>
        <aside
          className={`app-sidebar ${sidebarCollapsed ? "app-sidebar--collapsed" : ""}`}
          style={{ width: `${widthRem}rem`, minWidth: `${widthRem}rem` }}
          data-testid="app-sidebar"
        >
          <div className="app-sidebar__header">
            <Link href="/" className="app-sidebar__brand" data-testid="sidebar-brand">
              {!sidebarCollapsed && <span>Codemation</span>}
            </Link>
            <button
              type="button"
              className="app-sidebar__toggle"
              onClick={this.handleToggleCollapse}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-testid="sidebar-toggle"
            >
              {sidebarCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
            </button>
          </div>
          <nav className="app-sidebar__nav" aria-label="Main navigation">
            <AppLayoutNavItems collapsed={sidebarCollapsed} />
          </nav>
          {!sidebarCollapsed && (
            <div
              className="app-sidebar__resize-handle"
              onMouseDown={this.handleResizeStart}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              data-testid="sidebar-resize-handle"
            />
          )}
        </aside>
        <main className="app-main">
          <AppLayoutPageHeader />
          <AppMainContent>{children}</AppMainContent>
        </main>
      </div>
    );
  }
}

interface AppLayoutNavItemsProps {
  readonly collapsed: boolean;
}

function AppMainContent(args: Readonly<{ children: ReactNode }>): ReactNode {
  const pathname = usePathname();
  const isWorkflowDetail = /^\/workflows\/[^/]+$/.test(pathname);
  return (
    <div
      className={`app-main__content ${isWorkflowDetail ? "app-main__content--full-bleed" : ""}`}
    >
      {args.children}
    </div>
  );
}

function AppLayoutPageHeader(): ReactNode {
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

function AppShellHeaderActions(): ReactNode {
  const { data: session, status } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (status === "loading") {
    return (
      <div
        className="app-shell-header-actions"
        data-testid="header-session-loading"
        aria-busy="true"
        aria-label="Loading session"
      />
    );
  }

  const email = session?.user?.email;
  if (!email) {
    return null;
  }

  const handleSignOut = (): void => {
    setIsSigningOut(true);
    void signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="app-shell-header-actions">
      <span className="app-shell-header-actions__email" data-testid="header-user-email" title={email}>
        {email}
      </span>
      <button
        type="button"
        className="app-shell-header-actions__logout"
        data-testid="header-logout"
        disabled={isSigningOut}
        onClick={handleSignOut}
      >
        {isSigningOut ? "Signing out…" : "Log out"}
      </button>
    </div>
  );
}

function getPageTitle(pathname: string, workflows: ReadonlyArray<{ id: string; name: string }>): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/credentials") return "Credentials";
  if (pathname === "/users") return "Users";
  if (pathname === "/workflows") return "Workflows";
  const workflowMatch = pathname.match(/^\/workflows\/([^/]+)/);
  if (workflowMatch) {
    const w = workflows.find((x) => x.id === decodeURIComponent(workflowMatch[1]));
    return w?.name ?? "Workflow";
  }
  return "Codemation";
}

function AppLayoutNavItems({ collapsed }: AppLayoutNavItemsProps): ReactNode {
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
              <span className="app-sidebar__workflow-icon"><IconWorkflow /></span>
            </Link>
          </span>
          {workflowsQuery.isLoading && (
            <span className="app-sidebar__workflow-placeholder">…</span>
          )}
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
                    <span className="app-sidebar__workflow-icon"><IconWorkflow /></span>
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
              <span className="app-sidebar__workflow-icon"><IconWorkflow /></span>
              <span className="app-sidebar__workflow-label">All workflows</span>
            </Link>
            {workflowsQuery.isLoading && (
              <span className="app-sidebar__workflow-placeholder">Loading…</span>
            )}
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
                  <span className="app-sidebar__workflow-icon"><IconWorkflow /></span>
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
