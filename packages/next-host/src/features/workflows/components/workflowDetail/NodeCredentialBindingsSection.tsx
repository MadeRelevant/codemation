import type {
  UpsertCredentialBindingRequest,
  WorkflowCredentialHealthDto,
} from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { codemationApiClient } from "../../../../api/CodemationApiClient";
import { CredentialConfirmDialog } from "../../../credentials/components/CredentialConfirmDialog";
import { CredentialDialog } from "../../../credentials/components/CredentialDialog";
import { useCredentialCreateDialog } from "../../../credentials/hooks/useCredentialCreateDialog";
import { useCredentialInstancesQuery, useWorkflowCredentialHealthQuery } from "../../hooks/realtime/realtime";
import { credentialInstancesQueryKey, workflowCredentialHealthQueryKey } from "../../lib/realtime/realtimeQueryKeys";
import { NodeCredentialBindingRow } from "./NodeCredentialBindingRow";
import type { WorkflowDiagramNode } from "../../lib/workflowDetail/workflowDetailTypes";
import { tryAutoBindUnboundWorkflowSlot } from "./tryAutoBindUnboundWorkflowSlot";

export function NodeCredentialBindingsSection(
  args: Readonly<{
    workflowId: string;
    node: WorkflowDiagramNode;
    pendingCredentialEditForNodeId: string | null;
    onConsumedPendingCredentialEdit: () => void;
  }>,
) {
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
    onCreated: async (instance) => {
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
    <section data-testid="node-properties-credential-section" style={{ padding: "10px 12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.64 }}>
        Credentials
      </div>
      <div
        style={{
          marginTop: 10,
          padding: "0 10px",
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {nodeCredentialSlots.map((slot, index) => {
          const compatibleInstances =
            credentialInstancesQuery.data?.filter((instance) =>
              slot.requirement.acceptedTypes.includes(instance.typeId),
            ) ?? [];
          const allInstances = credentialInstancesQuery.data ?? [];
          const bindingKey = `${slot.nodeId}:${slot.requirement.slotKey}`;
          const selectedInstanceId = bindingInstanceIdBySlotKey[bindingKey] ?? slot.instance?.instanceId ?? "";
          return (
            <div key={bindingKey} style={{ borderTop: index > 0 ? "1px solid #f1f5f9" : "none" }}>
              <NodeCredentialBindingRow
                slot={slot}
                compatibleInstances={compatibleInstances}
                allCredentialInstances={allInstances}
                selectedInstanceId={selectedInstanceId}
                isBinding={activeBindingSlotKey === bindingKey}
                onSelectInstance={(instanceId) => {
                  setBindingInstanceIdBySlotKey((current) => ({ ...current, [bindingKey]: instanceId }));
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
      {credentialError ? (
        <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", lineHeight: 1.35 }}>{credentialError}</div>
      ) : null}
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
