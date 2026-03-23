"use client";

import Link from "next/link";

import type { ReactNode } from "react";

import type { WorkflowSummary } from "../features/workflows/hooks/realtime/realtime";

import { WorkflowFolderTreeBuilder } from "./WorkflowFolderTreeBuilder";

import { WorkflowSidebarNavFolder } from "./WorkflowSidebarNavFolder";

import { IconWorkflow } from "./appLayoutSidebarIcons";

const treeBuilder = new WorkflowFolderTreeBuilder();

export function WorkflowSidebarNavTree(args: Readonly<{
  workflows: ReadonlyArray<WorkflowSummary>;
  pathname: string;
  workflowLinkClass: (isActive: boolean) => string;
  /** Icon-only / compact layout (collapsed shell sidebar). */
  collapsed?: boolean;
}>): ReactNode {
  const tree = treeBuilder.build(args.workflows);
  const collapsed = args.collapsed === true;
  return (
    <div className="space-y-0.5" data-testid="workflow-sidebar-nav-tree">
      {tree.workflows.map((w) => {
        const href = `/workflows/${encodeURIComponent(w.id)}`;
        const isActive = args.pathname === href;
        return (
          <Link
            key={w.id}
            href={href}
            className={args.workflowLinkClass(isActive)}
            data-testid={`nav-workflow-${w.id}`}
            title={w.discoveryPathSegments.length > 0 ? w.discoveryPathSegments.join(" / ") : w.name}
          >
            <span className="flex shrink-0 opacity-70" aria-hidden>
              <IconWorkflow />
            </span>
            {!collapsed && <span className="truncate text-sm">{w.name}</span>}
          </Link>
        );
      })}
      {tree.children.map((child) => (
        <WorkflowSidebarNavFolder
          key={child.segment}
          node={child}
          pathPrefix={[]}
          pathname={args.pathname}
          workflows={args.workflows}
          workflowLinkClass={args.workflowLinkClass}
          depth={0}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
}
