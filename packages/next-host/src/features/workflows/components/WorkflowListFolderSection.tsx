"use client";

import { ChevronRight, Folder } from "lucide-react";
import type { ReactNode } from "react";

import type { WorkflowSummary } from "../hooks/realtime/realtime";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { WorkflowFolderTreeNode } from "@/shell/WorkflowFolderTreeBuilder";
import { WorkflowFolderUi } from "@/shell/WorkflowFolderUi";

import { WorkflowListItemCard } from "./WorkflowListItemCard";

function folderTestId(folderPath: ReadonlyArray<string>): string {
  return `workflows-folder-${folderPath.join("__")}`;
}

export function WorkflowListFolderSection(args: Readonly<{
  node: WorkflowFolderTreeNode;
  folderPath: ReadonlyArray<string>;
  depth: number;
  pathname: string;
  workflows: ReadonlyArray<WorkflowSummary>;
}>): ReactNode {
  const { node, folderPath, depth, pathname, workflows } = args;
  const nextPath = [...folderPath, node.segment];
  const totalInTree = WorkflowFolderUi.countWorkflowsInSubtree(node);
  const defaultOpen = WorkflowFolderUi.computeDefaultFolderOpen(nextPath, pathname, workflows);

  return (
    <li className={cn("list-none", depth > 0 && "mt-2")}>
      <Collapsible defaultOpen={defaultOpen} className="overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 shadow-sm dark:from-card dark:via-card dark:to-muted/20">
        <CollapsibleTrigger
          type="button"
          data-testid={folderTestId(nextPath)}
          className={cn(
            "flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors",
            "hover:bg-muted/40",
            "focus-visible:ring-2 focus-visible:ring-ring/30",
            "[&[data-state=open]>svg:first-child]:rotate-90",
          )}
        >
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out"
            aria-hidden
          />
          <Folder className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground">{node.segment}</span>
          <Badge variant="secondary" className="font-mono text-[0.7rem] tabular-nums">
            {totalInTree}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t border-border/50 bg-muted/20 px-3 pb-4 pt-3 dark:bg-muted/10">
            <ul className="m-0 grid list-none gap-3 p-0">
              {node.workflows.map((workflow) => (
                <li key={workflow.id} className="list-none">
                  <WorkflowListItemCard workflow={workflow} appearance="folder" />
                </li>
              ))}
            </ul>
            {node.children.length > 0 ? (
              <ul className="m-0 list-none space-y-2 border-l-2 border-primary/15 pl-4">
                {node.children.map((child) => (
                  <WorkflowListFolderSection
                    key={child.segment}
                    node={child}
                    folderPath={nextPath}
                    depth={depth + 1}
                    pathname={pathname}
                    workflows={workflows}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
