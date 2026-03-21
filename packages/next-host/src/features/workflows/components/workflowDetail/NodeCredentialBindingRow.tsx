import type { UpsertCredentialBindingRequest, WorkflowCredentialHealthSlotDto } from "@codemation/host-src/application/contracts/CredentialContractsRegistry";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CredentialInstanceDto } from "../../hooks/realtime/realtime";

export function NodeCredentialBindingRow(args: Readonly<{
  slot: WorkflowCredentialHealthSlotDto;
  compatibleInstances: ReadonlyArray<CredentialInstanceDto>;
  selectedInstanceId: string;
  isBinding: boolean;
  onSelectInstance: (instanceId: string) => void;
  onBind: (request: UpsertCredentialBindingRequest) => void;
}>) {
  const { compatibleInstances, isBinding, onBind, onSelectInstance, selectedInstanceId, slot } = args;
  const typesLine = slot.requirement.acceptedTypes.join(" · ");
  const status = slot.health.status;
  const statusBadgeClass =
    status === "healthy"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : status === "failing"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : status === "unbound"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
          : status === "optional-unbound"
            ? "border-border bg-muted text-muted-foreground"
            : "border-border bg-muted text-muted-foreground";
  const statusLabel =
    status === "healthy"
      ? "OK"
      : status === "failing"
        ? "Fail"
        : status === "unbound"
          ? "Unbound"
          : status === "optional-unbound"
            ? "Optional"
            : "Unknown";
  const disabledBind = !selectedInstanceId || isBinding;
  return (
    <div
      data-testid={`node-properties-credential-slot-${slot.requirement.slotKey}`}
      className="flex flex-wrap items-center gap-2 py-2"
    >
      <div className="flex min-w-[160px] flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-foreground">{slot.requirement.label}</span>
          <span className="max-w-[min(100%,12rem)] truncate text-[11px] text-muted-foreground" title={typesLine}>
            {typesLine}
          </span>
          <Badge variant="outline" className={cn("shrink-0 px-1.5 py-0 text-[10px] font-extrabold tracking-wide uppercase", statusBadgeClass)}>
            {statusLabel}
          </Badge>
        </div>
        {slot.health.message ? (
          <div
            className={cn(
              "line-clamp-2 text-[11px] leading-snug",
              status === "failing" ? "text-destructive" : "text-muted-foreground",
            )}
            title={slot.health.message}
          >
            {slot.health.message}
          </div>
        ) : null}
      </div>
      <select
        data-testid={`node-properties-credential-slot-select-${slot.requirement.slotKey}`}
        value={selectedInstanceId}
        onChange={(event) => onSelectInstance(event.target.value)}
        className="h-8 min-w-[120px] max-w-[240px] flex-[1_1_140px] rounded-lg border border-input bg-transparent px-2 text-xs text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <option value="">Select instance...</option>
        {compatibleInstances.map((instance) => (
          <option key={instance.instanceId} value={instance.instanceId}>
            {instance.displayName}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        data-testid={`node-properties-credential-slot-bind-${slot.requirement.slotKey}`}
        disabled={disabledBind}
        className="shrink-0 text-xs font-bold"
        onClick={() =>
          onBind({
            workflowId: slot.workflowId,
            nodeId: slot.nodeId,
            slotKey: slot.requirement.slotKey,
            instanceId: selectedInstanceId,
          })
        }
      >
        {isBinding ? "Binding..." : "Bind"}
      </Button>
    </div>
  );
}
