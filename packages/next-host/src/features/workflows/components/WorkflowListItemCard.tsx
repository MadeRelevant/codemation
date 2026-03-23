"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { ReactNode } from "react";

import type { WorkflowSummary } from "../hooks/realtime/realtime";

import { cn } from "@/lib/utils";

export function WorkflowListItemCard(args: Readonly<{
  workflow: WorkflowSummary;
  appearance: "root" | "folder";
}>): ReactNode {
  const { workflow, appearance } = args;
  const href = `/workflows/${encodeURIComponent(workflow.id)}`;
  const pathLine = workflow.discoveryPathSegments.length > 0 ? workflow.discoveryPathSegments.join(" / ") : null;
  return (
    <div
      className={cn(
        "group relative -mx-1 rounded-md border border-transparent px-2.5 py-2 transition-[background-color,border-color,box-shadow]",
        "hover:border-border/55 hover:bg-muted/50 hover:shadow-sm",
        "focus-within:border-border/60 focus-within:bg-muted/45 focus-within:shadow-sm",
        appearance === "root" && "hover:bg-muted/55",
        appearance === "folder" && "hover:bg-muted/40",
      )}
      data-testid={`workflow-list-item-${workflow.id}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className={cn(
              "inline-flex max-w-full items-baseline gap-1.5 text-pretty text-sm font-medium leading-snug text-foreground no-underline",
              "transition-colors group-hover:text-primary",
              "focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
            )}
            data-testid={`workflow-open-${workflow.id}`}
          >
            <span className="truncate">{workflow.name}</span>
          </Link>
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[0.7rem] leading-snug text-muted-foreground">
            <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground/80">{workflow.id}</span>
            {pathLine !== null ? (
              <>
                <span className="select-none text-muted-foreground/35" aria-hidden>
                  ·
                </span>
                <span className="min-w-0 font-sans text-muted-foreground/75">{pathLine}</span>
              </>
            ) : null}
          </div>
        </div>
        <ChevronRight
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-[opacity,transform]",
            "opacity-0 group-hover:translate-x-px group-hover:opacity-70",
          )}
          aria-hidden
        />
      </div>
    </div>
  );
}
