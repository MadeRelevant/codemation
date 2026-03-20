import type { UpsertCredentialBindingRequest,WorkflowCredentialHealthSlotDto } from "@codemation/frontend-src/application/contracts/CredentialContracts";
import type { CredentialInstanceDto } from "../realtime/realtime";

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
  const statusTone =
    status === "healthy"
      ? { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", label: "OK" }
      : status === "failing"
        ? { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", label: "Fail" }
        : status === "unbound"
          ? { background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309", label: "Unbound" }
          : status === "optional-unbound"
            ? { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", label: "Optional" }
            : { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", label: "Unknown" };
  return (
    <div
      data-testid={`node-properties-credential-slot-${slot.requirement.slotKey}`}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
      }}
    >
      <div style={{ flex: "1 1 160px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: "#111827" }}>{slot.requirement.label}</span>
          <span style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={typesLine}>
            {typesLine}
          </span>
          <span
            style={{
              flex: "0 0 auto",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              padding: "2px 6px",
              background: statusTone.background,
              border: statusTone.border,
              color: statusTone.color,
            }}
          >
            {statusTone.label}
          </span>
        </div>
        {slot.health.message ? (
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.35,
              color: status === "failing" ? "#991b1b" : "#64748b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
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
        style={{
          flex: "1 1 140px",
          minWidth: 120,
          maxWidth: 240,
          fontSize: 12,
          padding: "4px 8px",
          border: "1px solid #d1d5db",
          background: "#fff",
          color: "#111827",
        }}
      >
        <option value="">Select instance...</option>
        {compatibleInstances.map((instance) => (
          <option key={instance.instanceId} value={instance.instanceId}>
            {instance.displayName}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid={`node-properties-credential-slot-bind-${slot.requirement.slotKey}`}
        disabled={!selectedInstanceId || isBinding}
        onClick={() =>
          onBind({
            workflowId: slot.workflowId,
            nodeId: slot.nodeId,
            slotKey: slot.requirement.slotKey,
            instanceId: selectedInstanceId,
          })
        }
        style={{
          flex: "0 0 auto",
          padding: "5px 10px",
          fontWeight: 700,
          fontSize: 12,
          cursor: !selectedInstanceId || isBinding ? "not-allowed" : "pointer",
          opacity: !selectedInstanceId || isBinding ? 0.55 : 1,
          border: "1px solid #111827",
          background: "#111827",
          color: "#fff",
        }}
      >
        {isBinding ? "Binding..." : "Bind"}
      </button>
    </div>
  );
}
