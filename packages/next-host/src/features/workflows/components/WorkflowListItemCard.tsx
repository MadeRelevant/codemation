"use client";

import Link from "next/link";

import type { ReactNode } from "react";

import type { WorkflowSummary } from "../hooks/realtime/realtime";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function WorkflowListItemCard(args: Readonly<{
  workflow: WorkflowSummary;
  appearance: "root" | "folder";
}>): ReactNode {
  const { workflow, appearance } = args;
  return (
    <Card
      className={cn(
        "border-border/60 shadow-sm transition-all",
        appearance === "root" &&
          "bg-gradient-to-br from-card to-muted/20 hover:border-primary/20 hover:shadow-md dark:to-muted/10",
        appearance === "folder" &&
          "bg-background/80 backdrop-blur-sm hover:border-primary/25 hover:shadow-md",
      )}
    >
      <CardContent className="flex flex-wrap items-baseline justify-between gap-4 py-4">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{workflow.id}</div>
          <div className="mt-1.5 text-lg font-bold tracking-tight">{workflow.name}</div>
          {workflow.discoveryPathSegments.length > 0 ? (
            <div className="mt-1.5 text-xs text-muted-foreground">{workflow.discoveryPathSegments.join(" / ")}</div>
          ) : null}
        </div>
        <Link
          href={`/workflows/${encodeURIComponent(workflow.id)}`}
          className="shrink-0 font-semibold text-primary no-underline hover:underline"
          data-testid={`workflow-open-${workflow.id}`}
        >
          Open
        </Link>
      </CardContent>
    </Card>
  );
}
