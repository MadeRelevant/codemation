"use client";
import type { UpsertCredentialBindingRequest, WorkflowCredentialHealthDto } from "@codemation/host/dto";
import { ApiPaths } from "@codemation/host/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { codemationApiClient } from "../../../api/CodemationApiClient";
import { CredentialConfirmDialog } from "../../credentials/components/CredentialConfirmDialog";
import { CredentialDialog } from "../../credentials/components/CredentialDialog";
import { useCredentialCreateDialog } from "../../credentials/hooks/useCredentialCreateDialog";
import {
  useCredentialInstancesQuery,
  useWorkflowCredentialHealthQuery,
  credentialInstancesQueryKey,
  workflowCredentialHealthQueryKey,
  NodeCredentialBindingRow,
  tryAutoBindUnboundWorkflowSlot,
} from "@codemation/canvas";
import type { NodeCredentialBindingsSlotProps } from "@codemation/canvas";

export function NextHostCredentialBindingsRenderer(args: NodeCredentialBindingsSlotProps): ReactNode {
  const { node, workflowId, pendingCredentialEditForNodeId, onConsumedPendingCredentialEdit } = args;
  const pendingCreateSlotBindingKeyRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const credentialInstancesQuery = useCredentialInstancesQuery();
  const workflowCredentialHealthQuery = useWorkflowCredentialHealthQuery(workflowId);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [bindingInstanceIdBySlotKey, setBindingInstanceIdBySlotKey] = useState<Readonly<Record<string, string>>>({});
  const [activeBindingSlotKey, setActiveBindingSlotKey] = useState<string | null>(null);

  const bindCredentialImpl = useCallback(
    async (request: UpsertCredentialBindingRequest): Promise<void> => {
      const activeKey = `${request.nodeId}:${request.slotKey}`;
      try {
        setActiveBindingSlotKey(activeKey);
        setCredentialError(null);
        await codemationApiClient.putJson<void>(ApiPaths.credentialBindings(), request);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: workflowCredentialHealthQueryKey(workflowId) }),
          queryClient.invalidateQueries({ queryKey: credentialInstancesQueryKey }),
        ]);
      } catch (error) {
        setCredentialError(error instanceof Error ? error.message : String(error));
      } finally {
        setActiveBindingSlotKey(null);
      }
    },
    [queryClient, workflowId],
  );

  const {
    isDialogOpen,
    dialogProps,
    openCreateDialog,
    openEditDialog,
    oauthDisconnectConfirmOpen,
    executeOAuthDisconnect,
    cancelOAuthDisconnect,
  } = useCredentialCreateDialog({
    workflowId,
    onCreated: async (instance: import("@codemation/canvas").CredentialInstanceDto) => {
      const key = pendingCreateSlotBindingKeyRef.current;
      if (key) {
        setBindingInstanceIdBySlotKey((current) => ({
          ...current,
          [key]: instance.instanceId,
        }));
        pendingCreateSlotBindingKeyRef.current = null;
        const firstColon = key.indexOf(":");
        const nodeId = firstColon >= 0 ? key.slice(0, firstColon) : "";
        const slotKey = firstColon >= 0 ? key.slice(firstColon + 1) : "";
        if (nodeId.length > 0 && slotKey.length > 0) {
          await queryClient.refetchQueries({ queryKey: workflowCredentialHealthQueryKey(workflowId) });
          const health = queryClient.getQueryData<WorkflowCredentialHealthDto>(
            workflowCredentialHealthQueryKey(workflowId),
          );
          const slot = health?.slots?.find((s) => s.nodeId === nodeId && s.requirement.slotKey === slotKey);
          if (!slot?.instance?.instanceId) {
            await bindCredentialImpl({
              workflowId,
              nodeId,
              slotKey,
              instanceId: instance.instanceId,
            });
          }
        }
      }
    },
  });
  const nodeCredentialSlots = useMemo(() => {
    const slots = workflowCredentialHealthQuery.data?.slots ?? [];
    return slots.filter((slot) => slot.nodeId === node.id);
  }, [node.id, workflowCredentialHealthQuery.data]);

  const pendingCredentialEditHandledRef = useRef(false);

  useEffect(() => {
    if (pendingCredentialEditForNodeId === null) {
      pendingCredentialEditHandledRef.current = false;
      return;
    }
    if (pendingCredentialEditForNodeId !== node.id) {
      pendingCredentialEditHandledRef.current = false;
    }
  }, [node.id, pendingCredentialEditForNodeId]);

  useEffect(() => {
    if (pendingCredentialEditForNodeId !== node.id) {
      return;
    }
    if (pendingCredentialEditHandledRef.current) {
      return;
    }
    if (workflowCredentialHealthQuery.isLoading) {
      return;
    }
    const slotsWithInstance = nodeCredentialSlots.filter((slot) => slot.instance?.instanceId);
    if (slotsWithInstance.length === 0) {
      pendingCredentialEditHandledRef.current = true;
      onConsumedPendingCredentialEdit();
      return;
    }
    if (credentialInstancesQuery.isLoading) {
      return;
    }
    const first = slotsWithInstance[0];
    const instanceId = first.instance!.instanceId;
    const full = credentialInstancesQuery.data?.find((instance) => instance.instanceId === instanceId);
    pendingCredentialEditHandledRef.current = true;
    if (full) {
      openEditDialog(full);
    }
    onConsumedPendingCredentialEdit();
  }, [
    credentialInstancesQuery.data,
    credentialInstancesQuery.isLoading,
    node.id,
    nodeCredentialSlots,
    onConsumedPendingCredentialEdit,
    openEditDialog,
    pendingCredentialEditForNodeId,
    workflowCredentialHealthQuery.isLoading,
  ]);

  useEffect(() => {
    setBindingInstanceIdBySlotKey({});
    setCredentialError(null);
    setActiveBindingSlotKey(null);
  }, [node.id]);

  if (workflowCredentialHealthQuery.isLoading || nodeCredentialSlots.length === 0) {
    return null;
  }

  return (
    <section data-testid="node-properties-credential-section" className="px-3 pb-3.5 pt-2.5">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.045em] opacity-65">Credentials</div>
      <div className="mt-2.5 flex flex-col border border-border bg-card px-2.5">
        {nodeCredentialSlots.map((slot, index) => {
          const compatibleInstances =
            credentialInstancesQuery.data?.filter((instance) =>
              slot.requirement.acceptedTypes.includes(instance.typeId),
            ) ?? [];
          const allInstances = credentialInstancesQuery.data ?? [];
          const bindingKey = `${slot.nodeId}:${slot.requirement.slotKey}`;
          const selectedInstanceId = bindingInstanceIdBySlotKey[bindingKey] ?? slot.instance?.instanceId ?? "";
          return (
            <div key={bindingKey} className={index > 0 ? "border-t border-secondary" : undefined}>
              <NodeCredentialBindingRow
                slot={slot}
                compatibleInstances={compatibleInstances}
                allCredentialInstances={allInstances}
                selectedInstanceId={selectedInstanceId}
                isBinding={activeBindingSlotKey === bindingKey}
                onSelectInstance={(instanceId) => {
                  setBindingInstanceIdBySlotKey((current) => ({ ...current, [bindingKey]: instanceId }));
                  if (instanceId.length === 0 || instanceId === slot.instance?.instanceId) {
                    return;
                  }
                  if (slot.instance?.instanceId) {
                    void bindCredentialImpl({
                      workflowId,
                      nodeId: slot.nodeId,
                      slotKey: slot.requirement.slotKey,
                      instanceId,
                    });
                    return;
                  }
                  tryAutoBindUnboundWorkflowSlot(slot, instanceId, bindCredentialImpl, workflowId);
                }}
                onBind={(request) => void bindCredentialImpl(request)}
                onEditCredential={openEditDialog}
                onRequestNewCredential={() => {
                  pendingCreateSlotBindingKeyRef.current = bindingKey;
                  const accepted = slot.requirement.acceptedTypes;
                  openCreateDialog(accepted.length > 0 ? accepted : undefined);
                }}
              />
            </div>
          );
        })}
      </div>
      {credentialError ? <div className="mt-2 text-xs leading-snug text-danger">{credentialError}</div> : null}
      {oauthDisconnectConfirmOpen ? (
        <CredentialConfirmDialog
          title="Disconnect OAuth2?"
          testId="credential-oauth-disconnect-confirm-dialog"
          cancelTestId="credential-oauth-disconnect-confirm-cancel"
          confirmTestId="credential-oauth-disconnect-confirm-confirm"
          confirmLabel="Disconnect"
          confirmVariant="primary"
          onCancel={cancelOAuthDisconnect}
          onConfirm={() => void executeOAuthDisconnect()}
        >
          <p className="m-0 text-sm text-muted-foreground">
            This will remove the OAuth connection for this credential. You can reconnect later.
          </p>
        </CredentialConfirmDialog>
      ) : null}
      {isDialogOpen && dialogProps ? (
        <CredentialDialog
          key={dialogProps.editingInstance?.instanceId ?? "create"}
          {...dialogProps}
          onClose={() => {
            pendingCreateSlotBindingKeyRef.current = null;
            dialogProps.onClose();
          }}
        />
      ) : null}
    </section>
  );
}
