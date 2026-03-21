"use client";

import Link from "next/link";

import { Component, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AppLayoutNavItems } from "./AppLayoutNavItems";
import { AppLayoutPageHeader } from "./AppLayoutPageHeader";
import { AppMainContent } from "./AppMainContent";
import { IconChevronLeft, IconChevronRight } from "./appLayoutSidebarIcons";

const SIDEBAR_WIDTH_KEY = "codemation-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "codemation-sidebar-collapsed";
const MIN_SIDEBAR_WIDTH = 12;
const MAX_SIDEBAR_WIDTH = 28;
const DEFAULT_SIDEBAR_WIDTH = 16;

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
      <div className={cn("flex h-screen min-h-0 overflow-hidden", isResizing && "select-none")}>
        <aside
          className="relative flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,min-width] duration-200 ease-in-out"
          style={{ width: `${widthRem}rem`, minWidth: `${widthRem}rem` }}
          data-testid="app-sidebar"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
            <Link
              href="/"
              className="text-lg font-semibold text-sidebar-foreground no-underline hover:text-primary"
              data-testid="sidebar-brand"
            >
              {!sidebarCollapsed && <span>Codemation</span>}
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={this.handleToggleCollapse}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-testid="sidebar-toggle"
            >
              {sidebarCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
            </Button>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main navigation">
            <AppLayoutNavItems collapsed={sidebarCollapsed} />
          </nav>
          {!sidebarCollapsed && (
            <div
              className={cn(
                "absolute top-0 right-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/30",
                isResizing && "bg-primary/30",
              )}
              onMouseDown={this.handleResizeStart}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              data-testid="sidebar-resize-handle"
            />
          )}
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <AppLayoutPageHeader />
          <AppMainContent>{children}</AppMainContent>
        </main>
      </div>
    );
  }
}
