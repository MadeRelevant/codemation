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
    <ul className="m-0 grid list-none gap-4 p-0" data-testid="workflows-list">
      <WorkflowListRoot node={tree} pathname={pathname} workflows={args.workflows} />
    </ul>
  );
}
