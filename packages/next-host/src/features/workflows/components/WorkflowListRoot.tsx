"use client";

import type { ReactNode } from "react";

import type { WorkflowSummary } from "../hooks/realtime/realtime";

import type { WorkflowFolderTreeNode } from "@/shell/WorkflowFolderTreeBuilder";

import { WorkflowListFolderSection } from "./WorkflowListFolderSection";
import { WorkflowListItemCard } from "./WorkflowListItemCard";

export function WorkflowListRoot(args: Readonly<{
  node: WorkflowFolderTreeNode;
  pathname: string;
  workflows: ReadonlyArray<WorkflowSummary>;
}>): ReactNode {
  const { node, pathname, workflows } = args;
  return (
    <>
      {node.workflows.map((workflow) => (
        <li key={workflow.id} className="list-none">
          <WorkflowListItemCard workflow={workflow} appearance="root" />
        </li>
      ))}
      {node.children.map((child) => (
        <WorkflowListFolderSection
          key={child.segment}
          node={child}
          folderPath={[]}
          depth={0}
          pathname={pathname}
          workflows={workflows}
        />
      ))}
    </>
  );
}
