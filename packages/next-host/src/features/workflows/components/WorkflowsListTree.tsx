"use client";

import { usePathname } from "next/navigation";

import type { ReactNode } from "react";

import type { WorkflowSummary } from "../hooks/realtime/realtime";

import { WorkflowFolderTreeBuilder } from "@/shell/WorkflowFolderTreeBuilder";

import { WorkflowListRoot } from "./WorkflowListRoot";

const treeBuilder = new WorkflowFolderTreeBuilder();

export function WorkflowsListTree(args: Readonly<{ workflows: ReadonlyArray<WorkflowSummary> }>): ReactNode {
  const pathname = usePathname();
  const tree = treeBuilder.build(args.workflows);
  return (
    <div
      className="rounded-xl border border-border/50 bg-gradient-to-b from-card/90 to-muted/15 p-3 shadow-sm ring-1 ring-black/[0.04] dark:from-card/70 dark:to-muted/25 dark:ring-white/[0.05] sm:p-4"
      data-testid="workflows-list"
    >
      <ul className="m-0 grid list-none gap-1.5 p-0">
        <WorkflowListRoot node={tree} pathname={pathname} workflows={args.workflows} />
      </ul>
    </div>
  );
}
