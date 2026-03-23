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
    <li className={cn("list-none", depth > 0 && "mt-1.5")}>
      <Collapsible
        defaultOpen={defaultOpen}
        className="overflow-hidden rounded-lg border border-border/55 bg-card/80 shadow-none ring-1 ring-black/[0.03] dark:bg-card/60 dark:ring-white/[0.04]"
      >
        <CollapsibleTrigger
          type="button"
          data-testid={folderTestId(nextPath)}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm outline-none transition-colors",
            "text-foreground hover:bg-muted/50",
            "focus-visible:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/35",
            "[&[data-state=open]>svg:first-child]:rotate-90",
          )}
        >
          <ChevronRight
            className="size-3.5 shrink-0 text-muted-foreground/90 transition-transform duration-200 ease-out"
            aria-hidden
          />
          <Folder className="size-3.5 shrink-0 text-primary/85" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1 font-medium tracking-tight text-foreground">{node.segment}</span>
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center border border-border/50 bg-muted/60 px-1.5 font-mono text-[0.65rem] tabular-nums text-muted-foreground"
          >
            {totalInTree}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/45 bg-muted/[0.35] px-2 pb-2.5 pt-1.5 dark:bg-muted/15">
            <ul className="m-0 grid list-none gap-0 p-0">
              {node.workflows.map((workflow) => (
                <li key={workflow.id} className="list-none">
                  <WorkflowListItemCard workflow={workflow} appearance="folder" />
                </li>
              ))}
            </ul>
            {node.children.length > 0 ? (
              <ul className="m-0 mt-2 list-none space-y-1.5 border-l border-border/55 pl-3">
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
