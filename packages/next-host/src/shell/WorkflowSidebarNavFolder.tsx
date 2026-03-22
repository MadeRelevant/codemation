"use client";

import Link from "next/link";

import { ChevronRight, Folder } from "lucide-react";
import type { ReactNode } from "react";

import type { WorkflowSummary } from "../features/workflows/hooks/realtime/realtime";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { WorkflowFolderTreeNode } from "./WorkflowFolderTreeBuilder";
import { WorkflowFolderUi } from "./WorkflowFolderUi";

import { IconWorkflow } from "./appLayoutSidebarIcons";

function folderTestId(path: ReadonlyArray<string>): string {
  return `nav-workflow-folder-${path.join("__")}`;
}

export function WorkflowSidebarNavFolder(args: Readonly<{
  node: WorkflowFolderTreeNode;
  pathPrefix: ReadonlyArray<string>;
  pathname: string;
  workflows: ReadonlyArray<WorkflowSummary>;
  workflowLinkClass: (isActive: boolean) => string;
  depth: number;
}>): ReactNode {
  const { node, pathPrefix, pathname, workflows, workflowLinkClass, depth } = args;
  const folderPath = [...pathPrefix, node.segment];
  const defaultOpen = WorkflowFolderUi.computeDefaultFolderOpen(folderPath, pathname, workflows);
  const totalInTree = WorkflowFolderUi.countWorkflowsInSubtree(node);

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("rounded-lg", depth > 0 && "ml-0.5 border-l border-sidebar-border/60 pl-2")}
    >
      <CollapsibleTrigger
        type="button"
        data-testid={folderTestId(folderPath)}
        className={cn(
          "group/trigger flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors",
          "text-sidebar-foreground/90 hover:bg-sidebar-accent/70",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring/40",
          "[&[data-state=open]>svg:first-child]:rotate-90",
        )}
      >
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out"
          aria-hidden
        />
        <Folder className="size-3.5 shrink-0 text-primary/70" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{node.segment}</span>
        <span className="shrink-0 rounded-md bg-sidebar-accent/80 px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums text-muted-foreground">
          {totalInTree}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 pb-1 pl-1 pt-0.5">
          {node.workflows.map((w) => {
            const href = `/workflows/${encodeURIComponent(w.id)}`;
            const isActive = pathname === href;
            return (
              <Link
                key={w.id}
                href={href}
                className={workflowLinkClass(isActive)}
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
          {node.children.map((child) => (
            <WorkflowSidebarNavFolder
              key={child.segment}
              node={child}
              pathPrefix={folderPath}
              pathname={pathname}
              workflows={workflows}
              workflowLinkClass={workflowLinkClass}
              depth={depth + 1}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
