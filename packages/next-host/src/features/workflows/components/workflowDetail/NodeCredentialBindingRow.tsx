import type {
  UpsertCredentialBindingRequest,
  WorkflowCredentialHealthSlotDto,
} from "@codemation/host-src/application/contracts/CredentialContractsRegistry";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { CanvasNodeChromeTooltip } from "../canvas/CanvasNodeChromeTooltip";
import { AlertCircle, CheckCircle2, HelpCircle, Link2, Loader2, MinusCircle, Pencil, Plus, Unplug } from "lucide-react";
import type { ReactNode } from "react";
import type { CredentialInstanceDto } from "../../hooks/realtime/realtime";

const INSTANCE_PLACEHOLDER = "__none__";
const NEW_CREDENTIAL_VALUE = "__new_credential__";

class CredentialSlotHealthPresentation {
  private constructor() {}

  static icon(status: WorkflowCredentialHealthSlotDto["health"]["status"]): ReactNode {
    const iconClass = "size-4 shrink-0";
    if (status === "healthy") {
      return <CheckCircle2 className={cn(iconClass, "text-emerald-600 dark:text-emerald-400")} aria-hidden />;
    }
    if (status === "failing") {
      return <AlertCircle className={cn(iconClass, "text-destructive")} aria-hidden />;
    }
    if (status === "unbound") {
      return <Unplug className={cn(iconClass, "text-amber-600 dark:text-amber-400")} aria-hidden />;
    }
    if (status === "optional-unbound") {
      return <MinusCircle className={cn(iconClass, "text-muted-foreground")} aria-hidden />;
    }
    return <HelpCircle className={cn(iconClass, "text-muted-foreground")} aria-hidden />;
  }

  static label(status: WorkflowCredentialHealthSlotDto["health"]["status"]): string {
    if (status === "healthy") {
      return "Credential healthy";
    }
    if (status === "failing") {
      return "Credential check failed";
    }
    if (status === "unbound") {
      return "No credential bound";
    }
    if (status === "optional-unbound") {
      return "Optional slot unbound";
    }
    return "Credential status unknown";
  }
}

export function NodeCredentialBindingRow(
  args: Readonly<{
    slot: WorkflowCredentialHealthSlotDto;
    compatibleInstances: ReadonlyArray<CredentialInstanceDto>;
    /** Full catalog (e.g. bound instance may be resolved when not in the compatible filter). */
    allCredentialInstances: ReadonlyArray<CredentialInstanceDto>;
    selectedInstanceId: string;
    isBinding: boolean;
    onSelectInstance: (instanceId: string) => void;
    onBind: (request: UpsertCredentialBindingRequest) => void;
    onEditCredential: (instance: CredentialInstanceDto) => void;
    onRequestNewCredential: () => void;
  }>,
) {
  const {
    allCredentialInstances,
    compatibleInstances,
    isBinding,
    onBind,
    onEditCredential,
    onRequestNewCredential,
    onSelectInstance,
    selectedInstanceId,
    slot,
  } = args;
  const slotTestIdSuffix = `${slot.nodeId}-${slot.requirement.slotKey}`;
  const status = slot.health.status;
  const disabledBind = !selectedInstanceId || isBinding;
  const selectedCredentialInstance =
    selectedInstanceId !== ""
      ? (compatibleInstances.find((i) => i.instanceId === selectedInstanceId) ??
        allCredentialInstances.find((i) => i.instanceId === selectedInstanceId))
      : undefined;
  const canEditCredential = Boolean(selectedCredentialInstance);
  const healthTitle = CredentialSlotHealthPresentation.label(status);

  return (
    <div data-testid={`node-properties-credential-slot-${slotTestIdSuffix}`} className="flex flex-col gap-2 py-2">
      <div className="min-w-0">
        <span className="text-xs font-bold text-foreground">{slot.requirement.label}</span>
        {slot.health.message ? (
          <div
            className={cn(
              "mt-0.5 line-clamp-2 text-[11px] leading-snug",
              status === "failing" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {slot.health.message}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Select
          value={selectedInstanceId || INSTANCE_PLACEHOLDER}
          onValueChange={(value) => {
            if (value === NEW_CREDENTIAL_VALUE) {
              onRequestNewCredential();
              return;
            }
            onSelectInstance(value === INSTANCE_PLACEHOLDER ? "" : value);
          }}
        >
          <SelectTrigger
            className="h-8 min-h-8 w-full min-w-0 flex-1 sm:max-w-none"
            data-testid={`node-properties-credential-slot-select-${slotTestIdSuffix}`}
            size="sm"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <CanvasNodeChromeTooltip
                testId={`node-properties-credential-slot-status-tooltip-${slotTestIdSuffix}`}
                ariaLabel={healthTitle}
                tooltip={healthTitle}
              >
                <span
                  className="inline-flex shrink-0"
                  data-testid={`node-properties-credential-slot-status-${slotTestIdSuffix}`}
                >
                  {CredentialSlotHealthPresentation.icon(status)}
                </span>
              </CanvasNodeChromeTooltip>
              <SelectValue placeholder="Select credential…" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INSTANCE_PLACEHOLDER}>Select credential…</SelectItem>
            {compatibleInstances.map((instance) => (
              <SelectItem key={instance.instanceId} value={instance.instanceId}>
                {instance.displayName}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem
              value={NEW_CREDENTIAL_VALUE}
              data-testid={`node-properties-credential-slot-new-${slotTestIdSuffix}`}
              className="font-medium"
            >
              <span className="flex items-center gap-2">
                <Plus className="size-4 shrink-0" aria-hidden />
                <span>New credential</span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 px-2.5 text-xs font-bold leading-none"
          data-testid={`node-properties-credential-slot-edit-${slotTestIdSuffix}`}
          disabled={!canEditCredential}
          aria-label={canEditCredential ? undefined : "Select a credential to edit"}
          onClick={() => {
            if (selectedCredentialInstance) {
              onEditCredential(selectedCredentialInstance);
            }
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Pencil className="size-4 shrink-0" aria-hidden />
            <span className="leading-none">Edit</span>
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid={`node-properties-credential-slot-bind-${slotTestIdSuffix}`}
          disabled={disabledBind}
          className="h-8 shrink-0 px-2.5 text-xs font-bold leading-none"
          onClick={() =>
            onBind({
              workflowId: slot.workflowId,
              nodeId: slot.nodeId,
              slotKey: slot.requirement.slotKey,
              instanceId: selectedInstanceId,
            })
          }
        >
          <span className="inline-flex items-center gap-1.5">
            {isBinding ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                <span className="leading-none">Binding…</span>
              </>
            ) : (
              <>
                <Link2 className="size-4 shrink-0" aria-hidden />
                <span className="leading-none">Bind</span>
              </>
            )}
          </span>
        </Button>
      </div>
    </div>
  );
}
