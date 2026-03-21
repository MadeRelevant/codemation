import Link from "next/link";

import type { WorkflowSummary } from "../hooks/realtime/realtime";

import { Card, CardContent } from "@/components/ui/card";

export function WorkflowsList(args: Readonly<{ workflows: ReadonlyArray<WorkflowSummary> | undefined; error: string | null }>) {
  const { workflows, error } = args;

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="workflows-load-error">
        Failed to load workflows: {error}
      </p>
    );
  }

  if (!workflows) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="workflows-loading">
        Loading workflows…
      </p>
    );
  }

  if (workflows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="workflows-empty">
        No workflows found.
      </p>
    );
  }

  return (
    <ul className="m-0 grid list-none gap-3 p-0" data-testid="workflows-list">
      {workflows.map((workflow) => (
        <li key={workflow.id}>
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex flex-wrap items-baseline justify-between gap-4 py-4">
              <div className="min-w-0">
                <div className="font-mono text-xs text-muted-foreground">{workflow.id}</div>
                <div className="mt-1.5 text-lg font-bold">{workflow.name}</div>
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
        </li>
      ))}
    </ul>
  );
}
