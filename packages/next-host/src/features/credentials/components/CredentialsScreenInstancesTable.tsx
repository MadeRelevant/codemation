"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { CredentialInstanceDto } from "../../workflows/hooks/realtime/realtime";
import { CredentialsScreenHealthBadge } from "./CredentialsScreenHealthBadge";

export type CredentialsScreenInstancesTableProps = {
  credentialInstances: ReadonlyArray<CredentialInstanceDto>;
  testResult: { instanceId: string; status: string; message?: string } | null;
  activeTestInstanceId: string | null;
  onOpenEdit: (instance: CredentialInstanceDto) => void;
  onTest: (instance: CredentialInstanceDto) => Promise<void>;
  onOpenDelete: (instance: CredentialInstanceDto) => void;
};

export function CredentialsScreenInstancesTable({
  credentialInstances,
  testResult,
  activeTestInstanceId,
  onOpenEdit,
  onTest,
  onOpenDelete,
}: CredentialsScreenInstancesTableProps) {
  return (
    <Table data-testid="credentials-table">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Health</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {credentialInstances.map((instance) => (
          <TableRow key={instance.instanceId} data-testid={`credential-instance-row-${instance.instanceId}`}>
            <TableCell>
              <button
                type="button"
                className="cursor-pointer border-none bg-transparent p-0 text-left font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => onOpenEdit(instance)}
                data-testid={`credential-instance-name-${instance.instanceId}`}
              >
                {instance.displayName}
              </button>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">{instance.typeId}</span>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-muted-foreground">
                {instance.sourceKind}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-muted-foreground">
                {instance.setupStatus}
              </Badge>
            </TableCell>
            <TableCell>
              <CredentialsScreenHealthBadge status={instance.latestHealth?.status ?? "unknown"} />
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                {testResult?.instanceId === instance.instanceId && (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      testResult.status === "healthy" && "text-emerald-700 dark:text-emerald-400",
                      testResult.status !== "healthy" && "text-destructive",
                    )}
                    data-testid={`credential-test-result-${instance.instanceId}`}
                  >
                    {testResult.status === "healthy" ? "Healthy" : "Failing"}
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  data-testid={`credential-instance-test-button-${instance.instanceId}`}
                  onClick={() => void onTest(instance)}
                  disabled={activeTestInstanceId === instance.instanceId}
                >
                  {activeTestInstanceId === instance.instanceId ? "Testing…" : "Test"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  data-testid={`credential-instance-delete-button-${instance.instanceId}`}
                  onClick={() => onOpenDelete(instance)}
                >
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
