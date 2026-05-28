"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";

import type { HumanTaskRecord } from "../../../../src/server/devInboxComposition";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/components/ui/table";

function formatAge(createdAt: Date): string {
  const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function DevInboxTable({ tasks }: Readonly<{ tasks: HumanTaskRecord[] }>) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [decisionInFlight, setDecisionInFlight] = useState<string | null>(null);

  async function decide(taskId: string, approved: boolean): Promise<void> {
    setDecisionInFlight(taskId);
    try {
      const res = await fetch(`/api/hitl/tasks/${taskId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: { approved } }),
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(`Failed to decide task ${taskId}: ${text}`);
        return;
      }
      toast.success(approved ? "Task approved" : "Task rejected");
      // Brief delay so the toast is visible before the list refreshes.
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDecisionInFlight(null);
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending tasks.</p>;
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <Fragment key={task.id}>
              <TableRow>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                  >
                    {task.subject.title}
                  </button>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{task.subject.summary}</TableCell>
                <TableCell>{formatAge(task.createdAt)}</TableCell>
                <TableCell>{new Date(task.expiresAt).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={decisionInFlight === task.id}
                      onClick={() => decide(task.id, true)}
                      className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={decisionInFlight === task.id}
                      onClick={() => decide(task.id, false)}
                      className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </TableCell>
              </TableRow>
              {expanded === task.id && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                      {JSON.stringify(
                        {
                          id: task.id,
                          runId: task.runId,
                          workflowId: task.workflowId,
                          nodeId: task.nodeId,
                          subject: task.subject,
                          metadata: task.metadata,
                          onTimeout: task.onTimeout,
                          createdAt: task.createdAt,
                          expiresAt: task.expiresAt,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
