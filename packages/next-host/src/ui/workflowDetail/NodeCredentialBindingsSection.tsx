import type { UpsertCredentialBindingRequest } from "@codemation/frontend-src/application/contracts/CredentialContracts";
import { ApiPaths } from "@codemation/frontend-src/presentation/http/ApiPaths";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect,useMemo,useState } from "react";
import { useCredentialInstancesQuery,useWorkflowCredentialHealthQuery } from "../realtime/realtime";
import { NodeCredentialBindingRow } from "./NodeCredentialBindingRow";
import type { WorkflowDiagramNode } from "./workflowDetailTypes";

export function NodeCredentialBindingsSection(args: Readonly<{ workflowId: string; node: WorkflowDiagramNode }>) {
  const { node, workflowId } = args;
  const queryClient = useQueryClient();
  const credentialInstancesQuery = useCredentialInstancesQuery();
  const workflowCredentialHealthQuery = useWorkflowCredentialHealthQuery(workflowId);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [bindingInstanceIdBySlotKey, setBindingInstanceIdBySlotKey] = useState<Readonly<Record<string, string>>>({});
  const [activeBindingSlotKey, setActiveBindingSlotKey] = useState<string | null>(null);
  const nodeCredentialSlots = useMemo(
    () => workflowCredentialHealthQuery.data?.slots.filter((slot) => slot.nodeId === node.id) ?? [],
    [node.id, workflowCredentialHealthQuery.data],
  );

  useEffect(() => {
    setBindingInstanceIdBySlotKey({});
    setCredentialError(null);
    setActiveBindingSlotKey(null);
  }, [node.id]);

  const bindCredential = (request: UpsertCredentialBindingRequest) => {
    void (async () => {
      try {
        setActiveBindingSlotKey(request.slotKey);
        setCredentialError(null);
        const response = await fetch(ApiPaths.credentialBindings(), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["workflow-credential-health", workflowId] }),
          queryClient.invalidateQueries({ queryKey: ["credential-instances"] }),
        ]);
      } catch (error) {
        setCredentialError(error instanceof Error ? error.message : String(error));
      } finally {
        setActiveBindingSlotKey(null);
      }
    })();
  };

  return (
    <section data-testid="node-properties-credential-section" style={{ padding: "10px 12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.64 }}>Credentials</div>
      {nodeCredentialSlots.length === 0 ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid #e5e7eb",
            background: "#f8fafc",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#475569",
          }}
        >
          No credential slots declared for this node.
        </div>
      ) : (
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
              credentialInstancesQuery.data?.filter((instance) => slot.requirement.acceptedTypes.includes(instance.typeId)) ?? [];
            const selectedInstanceId = bindingInstanceIdBySlotKey[slot.requirement.slotKey] ?? slot.instance?.instanceId ?? "";
            return (
              <div key={slot.requirement.slotKey} style={{ borderTop: index > 0 ? "1px solid #f1f5f9" : "none" }}>
                <NodeCredentialBindingRow
                  slot={slot}
                  compatibleInstances={compatibleInstances}
                  selectedInstanceId={selectedInstanceId}
                  isBinding={activeBindingSlotKey === slot.requirement.slotKey}
                  onSelectInstance={(instanceId) =>
                    setBindingInstanceIdBySlotKey((current) => ({
                      ...current,
                      [slot.requirement.slotKey]: instanceId,
                    }))
                  }
                  onBind={bindCredential}
                />
              </div>
            );
          })}
        </div>
      )}
      {credentialError ? <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", lineHeight: 1.35 }}>{credentialError}</div> : null}
    </section>
  );
}
