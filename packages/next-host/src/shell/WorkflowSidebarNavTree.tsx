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
}>): ReactNode {
  const tree = treeBuilder.build(args.workflows);
  return (
    <div className="space-y-0.5">
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
            <span className="truncate text-sm">{w.name}</span>
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
        />
      ))}
    </div>
  );
}
